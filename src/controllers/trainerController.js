const { getError } = require("../helpers/getError");
const { isValidProgram } = require("../config/programRegistry");
const { hasAccess } = require("../utils/accessControl");
const { getProgramById, getFlatModules } = require("../services/programCacheService");
const { indexSize } = require("../helpers/retrieveChunks");
const trainerService = require("../services/trainerService");

// id -> title de todas las lecciones del programa (para validar lessonId y citar).
function buildLessonTitleMap(program) {
    const titleById = {};
    for (const mod of getFlatModules(program)) {
        for (const l of mod.lessons || []) titleById[l.id] = l.title;
    }
    return titleById;
}

/**
 * Mapea los chunks recuperados a citaciones {lessonId, title, startSec} RESUELTAS
 * contra el programa del request. Un chunk (keyed por video) puede pertenecer a
 * varias lecciones/cohortes: elegimos la lessonId que vive en ESTE programa.
 */
function mapCitations(chunks, titleById) {
    const seen = new Set();
    const citations = [];
    for (const c of chunks) {
        const lid = (c.lessonIds || []).find((id) => titleById[id]);
        if (!lid || seen.has(lid)) continue;
        seen.add(lid);
        citations.push({ lessonId: lid, title: titleById[lid], startSec: Math.round(c.startSec || 0) });
    }
    return citations;
}

const ask = async (req, res) => {
    if (process.env.TRAINER_ENABLED === "false") {
        return res.status(503).json(getError("SERVER_INTERNAL_ERROR", {
            friendlyMessage: "El Entrenador IA está temporalmente desactivado.",
        }));
    }

    try {
        const { question, programId, lessonId, history } = req.body;
        const user = req.userAuth;

        if (!isValidProgram(programId)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));
        const userProgram = user.programs?.[programId];
        if (!userProgram) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));
        if (!hasAccess(userProgram)) return res.status(403).json(getError("VALIDATION_LESSON_NOT_PURCHASED"));

        const program = await getProgramById(programId);
        if (!program) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));
        const titleById = buildLessonTitleMap(program);

        // lessonId sólo se usa si pertenece de verdad a este programa (no spoofeable).
        const effectiveLessonId = lessonId && titleById[lessonId] ? lessonId : null;

        const { answer, chunks } = await trainerService.answer({
            question, programId, lessonId: effectiveLessonId, history,
        });
        const citations = mapCitations(chunks, titleById);

        return res.status(200).json({ success: true, data: { answer, citations } });
    } catch (error) {
        console.error("[Trainer] Error en ask:", error.message);
        const status = error.status || error.statusCode;
        if (status === 429) return res.status(429).json(getError("AUTH_TOO_MANY_ATTEMPTS"));
        if (status >= 500 || /timeout|aborted|ECONN/i.test(error.message || "")) {
            return res.status(503).json(getError("SERVER_INTERNAL_ERROR"));
        }
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const health = async (req, res) => {
    return res.status(200).json({ success: true, data: { chunksInMemory: indexSize() } });
};

module.exports = { ask, health, mapCitations };
