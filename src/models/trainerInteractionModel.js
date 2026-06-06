const { Schema, model } = require("mongoose");

const citationSchema = new Schema(
    {
        lessonId: { type: String, required: true },
        title: { type: String, default: "" },
        startSec: { type: Number, default: 0 },
    },
    { _id: false }
);

/**
 * Una interacción (turno pregunta→respuesta) con el Entrenador IA.
 * Sirve para: feedback 👍/👎 por respuesta y métricas (qué lecciones generan más dudas).
 */
const trainerInteractionSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        programId: { type: String, required: true, index: true },
        lessonId: { type: String, default: null },
        question: { type: String, required: true },
        answer: { type: String, default: "" },
        citations: { type: [citationSchema], default: [] },
        model: { type: String, default: "" },
        feedback: { type: Number, enum: [-1, 0, 1], default: 0 }, // 👎 / sin / 👍
    },
    { timestamps: true }
);

trainerInteractionSchema.index({ programId: 1, lessonId: 1, createdAt: -1 });
trainerInteractionSchema.index({ feedback: 1 });

module.exports = { TrainerInteraction: model("TrainerInteraction", trainerInteractionSchema) };
