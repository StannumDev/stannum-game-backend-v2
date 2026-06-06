const mongoose = require("mongoose");
const { getError } = require("../helpers/getError");
const { isValidProgram } = require("../config/programRegistry");
const { hasAccess } = require("../utils/accessControl");
const { getProgramById, getFlatModules } = require("../services/programCacheService");
const { indexSize, ensureIndexLoaded } = require("../helpers/retrieveChunks");
const { TrainerInteraction } = require("../models/trainerInteractionModel");
const { Transcript } = require("../models/transcriptModel");
const trainerService = require("../services/trainerService");
const { TRAINER_MODEL: CHAT_MODEL } = require("../config/aiConfig");

// Cap de concurrencia global de llamadas a OpenAI: protege la instancia única
// y la cuota de la org. Por encima del tope se responde 503 (probá en unos segundos).
const MAX_INFLIGHT = Number(process.env.TRAINER_MAX_INFLIGHT) || 10;
let inFlight = 0;
const acquireSlot = () => (inFlight >= MAX_INFLIGHT ? false : (inFlight++, true));
const releaseSlot = () => { if (inFlight > 0) inFlight--; };
const BUSY_MSG = "STAN está con mucha demanda en este momento. Probá de nuevo en unos segundos.";

// Persiste la interacción (best-effort: nunca rompe la respuesta al alumno).
async function persistInteraction({ userId, programId, lessonId, question, answer, citations }) {
    try {
        const doc = await TrainerInteraction.create({
            userId, programId, lessonId: lessonId || null,
            question, answer, citations, model: CHAT_MODEL,
        });
        return doc._id.toString();
    } catch (err) {
        console.error("[Trainer] No se pudo persistir la interacción:", err.message);
        return null;
    }
}

// id -> title de todas las lecciones del programa (para validar lessonId y citar).
function buildLessonTitleMap(program) {
    const titleById = {};
    for (const mod of getFlatModules(program)) {
        for (const l of mod.lessons || []) titleById[l.id] = l.title;
    }
    return titleById;
}

// Score mínimo (coseno crudo) para que un chunk aparezca como cita clickeable.
// Calibrado contra scores reales de prod (text-embedding-3-small) DESPUÉS del index v3
// (embedding enriquecido con título+topics, que separó mejor las clases):
//   social ("hola" ~0.30, "gracias" ~0.31, "buenísimo dale" ~0.34) → se filtra
//   legítimo-débil (acrónimos/typos: "racs" 0.378, "R.A.C.S." 0.445) → SÍ cita
//   consultas claras 0.50-0.72
// 0.36 es el punto medio entre el techo social (~0.34) y las legítimas-débiles (~0.378).
const MIN_CITATION_SCORE = 0.36;
const MAX_CITATIONS = 3;

// Vista previa de QUÉ se dice en ese minuto (extracto del transcript del chunk), para que la
// cita explique por qué se recomienda y no solo "minuto X". Limpio y truncado a ~140 chars.
function citationSnippet(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= 140) return clean;
    const cut = clean.slice(0, 140);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Mapea los chunks recuperados a citaciones {lessonId, title, startSec, snippet} RESUELTAS
 * contra el programa del request (un chunk/video puede pertenecer a varias lecciones).
 * Solo incluye chunks con rawScore >= MIN_CITATION_SCORE.
 * UNA cita por lección: el chunk de mayor score de esa lección (su minuto más relevante).
 * La navegación fina por minutos vive en la línea de tiempo por topics de la lección.
 * Preserva el orden por score y corta en MAX_CITATIONS.
 */
function mapCitations(chunks, titleById) {
    // Si el mejor chunk es de PLATAFORMA (global), la respuesta no es de una lección → sin citas
    // (evita citas de lección espurias en preguntas de producto/onboarding).
    if (chunks[0]?.global) return [];
    const seen = new Set();
    const citations = [];
    for (const c of chunks) {
        if (citations.length >= MAX_CITATIONS) break;
        if ((c.rawScore ?? c.score ?? 0) < MIN_CITATION_SCORE) continue;
        const lid = (c.lessonIds || []).find((id) => titleById[id]);
        if (!lid || seen.has(lid)) continue; // una sola cita por lección (la del minuto más relevante)
        seen.add(lid);
        citations.push({ lessonId: lid, title: titleById[lid], startSec: Math.round(c.startSec || 0), snippet: citationSnippet(c.text), muxPlaybackId: c.muxPlaybackId || null });
    }
    return citations;
}

/**
 * Validación + gating compartido por ask y askStream.
 * Devuelve el contexto, o null si ya respondió con un error.
 */
async function prepareAsk(req, res) {
    if (process.env.TRAINER_ENABLED === "false") {
        res.status(503).json(getError("SERVER_INTERNAL_ERROR", { friendlyMessage: "El Entrenador IA está temporalmente desactivado." }));
        return null;
    }

    const { question, lessonId, history } = req.body;
    const user = req.userAuth;
    // programId case-insensitive (paridad con /chapters, que también lo baja a minúscula). Falsy → modo general.
    const programId = req.body.programId ? String(req.body.programId).toLowerCase() : null;

    // Nombre derivado del server (no del body): cierra el vector de inyección por userName.
    const serverName = user?.profile?.name;
    const effectiveUserName = typeof serverName === "string" && serverName.trim() ? serverName.trim().slice(0, 80) : null;

    // MODO GENERAL: sin programId, STAN responde SOLO del corpus global (plataforma/empresa), sin lecciones.
    if (!programId) {
        return { question, programId: null, history, titleById: {}, effectiveLessonId: null, allowedLessonIds: null, futureLessonIds: null, userId: user._id, userName: effectiveUserName };
    }

    if (!isValidProgram(programId)) { res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID")); return null; }
    const userProgram = user.programs?.[programId];
    if (!userProgram) { res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND")); return null; }
    if (!hasAccess(userProgram)) { res.status(403).json(getError("VALIDATION_LESSON_NOT_PURCHASED")); return null; }

    const program = await getProgramById(programId);
    if (!program) { res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND")); return null; }
    const titleById = buildLessonTitleMap(program);

    // lessonId sólo se usa si pertenece de verdad a este programa (no spoofeable).
    const effectiveLessonId = lessonId && titleById[lessonId] ? lessonId : null;

    // Sólo se recupera/cita de lecciones YA desbloqueadas (orden <= lección actual).
    // Evita que STAN sugiera lecciones futuras y bloqueadas.
    let allowedLessonIds = null;
    let futureLessonIds = null; // lecciones BLOQUEADAS (posteriores a la actual): para el forward-reference
    if (effectiveLessonId) {
        const flatLessonIds = getFlatModules(program).flatMap((m) => (m.lessons || []).map((l) => l.id));
        const idx = flatLessonIds.indexOf(effectiveLessonId);
        if (idx >= 0) {
            allowedLessonIds = flatLessonIds.slice(0, idx + 1);
            futureLessonIds = flatLessonIds.slice(idx + 1);
        }
    }

    return { question, programId, history, titleById, effectiveLessonId, allowedLessonIds, futureLessonIds, userId: user._id, userName: effectiveUserName };
}

function classifyAndRespond(res, error, where) {
    console.error(`[Trainer] Error en ${where}:`, error.message);
    const status = error.status || error.statusCode;
    if (status === 429) return res.status(429).json(getError("AUTH_TOO_MANY_ATTEMPTS"));
    if (status >= 500 || /timeout|aborted|ECONN/i.test(error.message || "")) return res.status(503).json(getError("SERVER_INTERNAL_ERROR"));
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
}

const ask = async (req, res) => {
    const ctx = await prepareAsk(req, res);
    if (!ctx) return;
    if (!acquireSlot()) return res.status(503).json(getError("SERVER_INTERNAL_ERROR", { friendlyMessage: BUSY_MSG }));
    try {
        const { answer, chunks } = await trainerService.answer({
            question: ctx.question, programId: ctx.programId, lessonId: ctx.effectiveLessonId,
            history: ctx.history, allowedLessonIds: ctx.allowedLessonIds, futureLessonIds: ctx.futureLessonIds, userName: ctx.userName,
        });
        const citations = mapCitations(chunks, ctx.titleById);
        const interactionId = await persistInteraction({
            userId: ctx.userId, programId: ctx.programId || "__general__", lessonId: ctx.effectiveLessonId,
            question: ctx.question, answer, citations,
        });
        return res.status(200).json({ success: true, data: { answer, citations, interactionId } });
    } catch (error) {
        return classifyAndRespond(res, error, "ask");
    } finally {
        releaseSlot();
    }
};

const askStream = async (req, res) => {
    const ctx = await prepareAsk(req, res);
    if (!ctx) return;
    // Cap de concurrencia ANTES de abrir el SSE: si saturado, 503 JSON normal.
    if (!acquireSlot()) return res.status(503).json(getError("SERVER_INTERNAL_ERROR", { friendlyMessage: BUSY_MSG }));

    // TODO el setup del SSE va DENTRO del try: si flushHeaders/write lanzan (socket ya
    // cerrado por el cliente), el finally libera igual el slot (evita inFlight pegado).
    const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    let heartbeat = null;
    let closed = false;
    let chunks = [];
    let full = "";
    try {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no"); // evita buffering en proxies (Railway/nginx)
        if (res.flushHeaders) res.flushHeaders();
        res.write(": open\n\n"); // primer byte inmediato: evita que el proxy corte por idle antes del TTFT
        heartbeat = setInterval(() => { if (!res.writableEnded) res.write(": ping\n\n"); }, 15000);
        req.on("close", () => { closed = true; });

        for await (const ev of trainerService.streamAnswer({
            question: ctx.question, programId: ctx.programId, lessonId: ctx.effectiveLessonId,
            history: ctx.history, allowedLessonIds: ctx.allowedLessonIds, futureLessonIds: ctx.futureLessonIds, userName: ctx.userName,
        })) {
            if (closed) break;
            if (ev.type === "sources") { chunks = ev.chunks; continue; }
            if (ev.type === "delta") { full += ev.text; sse({ type: "delta", text: ev.text }); }
        }
        if (!closed) {
            const citations = mapCitations(chunks, ctx.titleById);
            const interactionId = await persistInteraction({
                userId: ctx.userId, programId: ctx.programId || "__general__", lessonId: ctx.effectiveLessonId,
                question: ctx.question, answer: full, citations,
            });
            sse({ type: "done", citations, interactionId });
        }
    } catch (error) {
        console.error("[Trainer] Error en askStream:", error.message, error.status || '');
        if (!closed) sse({ type: "error", message: "No pude responder ahora. Probá de nuevo." });
    } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (!res.writableEnded) res.end();
        releaseSlot(); // único release; cubre todos los paths, incluso si el setup SSE lanza
    }
};

const health = async (req, res) => {
    return res.status(200).json({ success: true, data: { chunksInMemory: indexSize() } });
};

const reloadIndex = async (req, res) => {
    try {
        const idx = await ensureIndexLoaded(true);
        return res.status(200).json({ success: true, data: { chunksInMemory: idx.length } });
    } catch (error) {
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// 👍/👎 sobre una respuesta. Sólo el dueño de la interacción puede calificarla.
const feedback = async (req, res) => {
    try {
        const { interactionId, value } = req.body;
        if (![1, -1, 0].includes(value)) return res.status(400).json(getError("VALIDATION_MISSING_FIELDS"));
        if (!mongoose.isValidObjectId(interactionId)) return res.status(400).json(getError("VALIDATION_MISSING_FIELDS"));

        const result = await TrainerInteraction.updateOne(
            { _id: interactionId, userId: req.userAuth._id },
            { $set: { feedback: value } }
        );
        if (result.matchedCount === 0) return res.status(404).json(getError("TRAINER_INTERACTION_NOT_FOUND"));
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("[Trainer] Error en feedback:", error.message);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// Métricas de uso (admin): volumen, lecciones con más dudas, ratio de feedback.
const metrics = async (req, res) => {
    try {
        const programId = req.query.programId;
        const match = programId ? { programId } : {};

        const [totals, topLessons, byProgram] = await Promise.all([
            TrainerInteraction.aggregate([
                { $match: match },
                { $group: { _id: null, total: { $sum: 1 }, up: { $sum: { $cond: [{ $eq: ["$feedback", 1] }, 1, 0] } }, down: { $sum: { $cond: [{ $eq: ["$feedback", -1] }, 1, 0] } } } },
            ]),
            TrainerInteraction.aggregate([
                { $match: { ...match, lessonId: { $ne: null } } },
                { $group: { _id: { programId: "$programId", lessonId: "$lessonId" }, count: { $sum: 1 }, up: { $sum: { $cond: [{ $eq: ["$feedback", 1] }, 1, 0] } }, down: { $sum: { $cond: [{ $eq: ["$feedback", -1] }, 1, 0] } } } },
                { $sort: { count: -1 } },
                { $limit: 20 },
            ]),
            TrainerInteraction.aggregate([
                { $match: match },
                { $group: { _id: "$programId", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
        ]);

        const t = totals[0] || { total: 0, up: 0, down: 0 };
        return res.status(200).json({
            success: true,
            data: {
                total: t.total, feedback: { up: t.up, down: t.down },
                topLessons: topLessons.map((l) => ({ programId: l._id.programId, lessonId: l._id.lessonId, count: l.count, up: l.up, down: l.down })),
                byProgram: byProgram.map((p) => ({ programId: p._id, count: p.count })),
            },
        });
    } catch (error) {
        console.error("[Trainer] Error en metrics:", error.message);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// Línea de tiempo por topics de una lección: capítulos {title, startSec} para saltar al minuto.
const chapters = async (req, res) => {
    try {
        const programId = String(req.query.programId || "").toLowerCase();
        const lessonId = String(req.query.lessonId || "");
        const user = req.userAuth;

        if (!isValidProgram(programId)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));
        const userProgram = user.programs?.[programId];
        if (!userProgram) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));
        if (!hasAccess(userProgram)) return res.status(403).json(getError("VALIDATION_LESSON_NOT_PURCHASED"));

        const program = await getProgramById(programId);
        if (!program) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));

        // lessonId → muxPlaybackId desde la colección Program (no el catálogo).
        let muxPlaybackId = null;
        for (const mod of getFlatModules(program)) {
            const l = (mod.lessons || []).find((x) => x.id === lessonId);
            if (l) { muxPlaybackId = l.muxPlaybackId; break; }
        }
        if (!muxPlaybackId) return res.status(200).json({ success: true, data: { chapters: [] } });

        const t = await Transcript.findOne({ muxPlaybackId }, { chapters: 1 }).lean();
        return res.status(200).json({ success: true, data: { chapters: t?.chapters || [] } });
    } catch (error) {
        console.error("[Trainer] Error en chapters:", error.message);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { ask, askStream, health, reloadIndex, feedback, metrics, chapters, mapCitations };
