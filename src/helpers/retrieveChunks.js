/**
 * Retrieve Chunks (Fase 2 — IA Entrenador / RAG)
 * --------------------------------------------------------------------------
 * Recuperación por similitud coseno EN MEMORIA sobre los chunks embebidos de la
 * colección `transcripts`. A esta escala (~25 videos / cientos de chunks) no hace
 * falta Atlas Vector Search: se carga el índice una vez y se rankea en JS.
 *
 * Reusable por el runtime (Fase 3): `ensureIndexLoaded()` al boot, `retrieve()` por request.
 * Asume que mongoose ya está conectado (en la app) o lo conecta el CLI de prueba.
 *
 * CLI de prueba:
 *   node src/helpers/retrieveChunks.js "¿qué es un LLM?" --program=tia
 */

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { Transcript } = require("../models/transcriptModel");
const { KnowledgeBase } = require("../models/knowledgeBaseModel");

const EMBED_MODEL = process.env.TRAINER_EMBED_MODEL || "text-embedding-3-small";
// Boost MULTIPLICATIVO (no aditivo) para no romper la escala del coseno.
const LESSON_BOOST = 1.25; // lección que el alumno está viendo
const MODULE_BOOST = 1.10; // misma unidad temática (módulo)
const GLOBAL_WEIGHT = 0.9; // corpus de plataforma: leve down-weight para no ahogar al contenido de lección
const MIN_SCORE = 0.15; // piso de coseno crudo: por debajo, se descarta (señal "no cubierto")

// "TIAM02L05" -> "TIAM02" (módulo). Robusto a cohortes (TIAPM/TIASM/TMDM).
function moduleOf(lessonId) {
    return typeof lessonId === "string" ? lessonId.replace(/L\d+.*$/i, "") : "";
}

let INDEX = null; // [{ muxPlaybackId, programIds, lessonIds, idx, text, startSec, endSec, embedding }]
let openaiClient = null;

function getEnvVar(name) {
    if (process.env[name]) return process.env[name];
    try {
        const envRaw = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
        const line = envRaw.split("\n").find((l) => l.trim().startsWith(`${name}=`));
        if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch (_) {}
    return null;
}

function getOpenAI() {
    if (!openaiClient) {
        const apiKey = getEnvVar("OPENAI_API_KEY");
        if (!apiKey) throw new Error("OPENAI_API_KEY no encontrada");
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
}

async function ensureIndexLoaded(force = false) {
    if (INDEX && !force) return INDEX;
    const docs = await Transcript.find(
        { "chunks.0": { $exists: true } },
        { muxPlaybackId: 1, programIds: 1, lessonIds: 1, chunks: 1 }
    ).lean();
    const idx = [];
    for (const d of docs) {
        for (const c of d.chunks || []) {
            if (!c.embedding?.length) continue;
            idx.push({
                muxPlaybackId: d.muxPlaybackId,
                programIds: d.programIds || [],
                lessonIds: d.lessonIds || [],
                idx: c.idx,
                text: c.text,
                startSec: c.startSec,
                endSec: c.endSec,
                embedding: c.embedding,
            });
        }
    }
    // Corpus GLOBAL de plataforma (no scopeado): entra al mismo índice con global:true y
    // arrays vacíos (OBLIGATORIOS: el filtro de retrieve hace .includes sobre programIds/lessonIds).
    const kb = await KnowledgeBase.find(
        { "chunks.0": { $exists: true } },
        { key: 1, title: 1, chunks: 1 }
    ).lean();
    for (const d of kb) {
        for (const c of d.chunks || []) {
            if (!c.embedding?.length) continue;
            idx.push({
                global: true,
                title: d.title,
                text: c.text,
                embedding: c.embedding,
                programIds: [],
                lessonIds: [],
                startSec: 0,
                endSec: 0,
                muxPlaybackId: null,
            });
        }
    }
    INDEX = idx;
    return INDEX;
}

function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedQuery(query) {
    const res = await getOpenAI().embeddings.create({ model: EMBED_MODEL, input: query });
    return res.data[0].embedding;
}

/**
 * @param {string} query
 * @param {object} opts { programId?, lessonId?, topK?, allowedLessonIds? }
 *   allowedLessonIds: si se pasa, sólo se recupera de esas lecciones (las ya
 *   desbloqueadas/vistas). Evita citar lecciones futuras y bloqueadas.
 * @returns {Promise<Array<{muxPlaybackId,lessonIds,programIds,startSec,endSec,text,score}>>}
 */
async function retrieve(query, { programId = null, lessonId = null, topK = 5, minScore = MIN_SCORE, allowedLessonIds = null, includeGlobal = true } = {}) {
    // Sin programId = MODO GENERAL: el filtro de abajo deja SOLO chunks `global` (plataforma/empresa);
    // los de lección quedan fuera porque `programIds.includes(null)` es false. NO hay fuga cross-programa.
    await ensureIndexLoaded();
    const qv = await embedQuery(query);
    const curModule = moduleOf(lessonId);
    const allowed = allowedLessonIds && allowedLessonIds.length ? new Set(allowedLessonIds) : null;

    // Pool: chunks GLOBAL de plataforma (si includeGlobal) + chunks de lección gateados por
    // programa y, opcional, sólo lecciones desbloqueadas. includeGlobal=false en el scan de
    // futuras (forward-reference) para que la plataforma no se cuele como "lección futura".
    const pool = INDEX.filter((c) =>
        c.global
            ? includeGlobal
            : c.programIds.includes(programId) && (!allowed || c.lessonIds.some((id) => allowed.has(id)))
    );

    const scored = pool
        .map((c) => {
            const raw = cosine(qv, c.embedding);
            let boost = 1;
            if (c.global) boost = GLOBAL_WEIGHT; // leve down-weight: en empate gana el contenido de lección
            else if (lessonId && c.lessonIds.includes(lessonId)) boost = LESSON_BOOST;
            else if (curModule && c.lessonIds.some((id) => moduleOf(id) === curModule)) boost = MODULE_BOOST;
            return { c, raw, score: raw * boost };
        })
        .filter((x) => x.raw >= minScore) // piso sobre el coseno crudo, no sobre el boosteado
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ c, raw, score }) => ({
            muxPlaybackId: c.muxPlaybackId,
            lessonIds: c.lessonIds,
            programIds: c.programIds,
            startSec: c.startSec,
            endSec: c.endSec,
            text: c.text,
            score,
            rawScore: raw,
            global: !!c.global,
            title: c.title || null,
        }));
    return scored;
}

module.exports = { ensureIndexLoaded, retrieve, cosine, indexSize: () => (INDEX ? INDEX.length : 0) };

if (require.main === module) {
    const mongoose = require("mongoose");
    (async () => {
        const args = process.argv.slice(2);
        const query = args.filter((a) => !a.startsWith("--")).join(" ") || "¿qué es un LLM?";
        const progArg = args.find((a) => a.startsWith("--program="));
        const lessonArg = args.find((a) => a.startsWith("--lesson="));
        const programId = progArg ? progArg.split("=")[1] : "tia";
        const lessonId = lessonArg ? lessonArg.split("=")[1] : null;

        const dbUrl = getEnvVar("DB_URL");
        if (!dbUrl) throw new Error("DB_URL no encontrada");
        await mongoose.connect(dbUrl);
        await ensureIndexLoaded();
        console.log(`Índice: ${INDEX.length} chunks cargados`);
        console.log(`Query: "${query}"  (program=${programId}${lessonId ? `, lesson=${lessonId}` : ""})\n`);
        const results = await retrieve(query, { programId, lessonId, topK: 5 });
        for (const r of results) {
            console.log(`  [${r.score.toFixed(3)}] ${r.lessonIds.join(",")} @${r.startSec}s`);
            console.log(`    "${r.text.slice(0, 160)}…"\n`);
        }
        await mongoose.disconnect();
    })().catch((e) => {
        console.error("FAILED:", e);
        process.exit(1);
    });
}
