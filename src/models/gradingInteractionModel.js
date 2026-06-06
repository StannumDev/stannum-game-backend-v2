const { Schema, model } = require("mongoose");

/**
 * Registro de auditoría de UNA corrección automática (Grader IA).
 * Antes no se guardaba NADA del proceso de grading: si un alumno reclamaba una nota,
 * no había traza de qué vio el modelo ni qué devolvió. Esto lo hace auditable y permite
 * medir costo (tokens) y detectar regresiones (p. ej. un prompt vacío).
 * Best-effort: persistirlo nunca debe romper la corrección.
 */
const gradingInteractionSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        programId: { type: String, required: true, index: true },
        instructionId: { type: String, required: true },
        model: { type: String, default: "" },
        status: { type: String, enum: ["GRADED", "ERROR"], required: true },
        score: { type: Number, default: null },
        observations: { type: String, default: "" },
        referencedLessons: { type: [String], default: [] },
        // Respuesta cruda del modelo (truncada) para poder auditar una nota a posteriori.
        rawResponse: { type: String, default: "" },
        tokens: {
            prompt: { type: Number, default: null },
            completion: { type: Number, default: null },
            total: { type: Number, default: null },
        },
    },
    { timestamps: true }
);

gradingInteractionSchema.index({ instructionId: 1, createdAt: -1 });
gradingInteractionSchema.index({ programId: 1, createdAt: -1 });

module.exports = { GradingInteraction: model("GradingInteraction", gradingInteractionSchema) };
