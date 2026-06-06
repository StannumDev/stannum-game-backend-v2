/**
 * Configuración central de los subsistemas de IA (Entrenador STAN + Grader).
 * Fuente ÚNICA de verdad de modelos y flags: evita que el default del modelo se
 * desincronice entre service y controller (lo que haría que la métrica de costo mienta).
 */
module.exports = {
    // Entrenador (STAN)
    TRAINER_MODEL: process.env.TRAINER_MODEL || "gpt-4o-mini",
    TRAINER_EMBED_MODEL: process.env.TRAINER_EMBED_MODEL || "text-embedding-3-small",

    // Corrector de entregas (Grader)
    GRADER_MODEL: process.env.GRADER_MODEL || "gpt-4o",
    // Kill-switch del grader (paridad con TRAINER_ENABLED). "false" lo desactiva.
    GRADER_ENABLED: process.env.GRADER_ENABLED !== "false",
    // Cap de concurrencia de llamadas OpenAI del grader (protege cuota compartida con el Trainer).
    GRADER_MAX_INFLIGHT: Number(process.env.GRADER_MAX_INFLIGHT) || 5,
};
