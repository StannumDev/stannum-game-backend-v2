const { Schema, model } = require("mongoose");

// Chunk de un artículo de conocimiento de plataforma, con su embedding (lo completa el script).
const kbChunkSchema = new Schema(
    {
        text: { type: String, required: true },
        embedding: { type: [Number], default: undefined },
    },
    { _id: false }
);

/**
 * Knowledge base de la PLATAFORMA STANNUM Game (mecánicas, procesos, onboarding) para que STAN
 * responda dudas del producto, no solo del contenido de las lecciones. Corpus GLOBAL: NO está
 * scopeado a programa/lección; se carga al mismo índice en memoria del RAG (ver retrieveChunks).
 * Fuente: src/config/platformKnowledge.json (curado, para alumnos). Idempotente por meta.version+embedModel+texto.
 */
const knowledgeBaseSchema = new Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        title: { type: String, required: true, trim: true },
        text: { type: String, default: "" },
        chunks: { type: [kbChunkSchema], default: [] },
        meta: {
            type: new Schema(
                {
                    version: { type: String, default: "" },
                    embedModel: { type: String, default: "" },
                    indexedAt: { type: Date, default: null },
                },
                { _id: false }
            ),
            default: () => ({}),
        },
    },
    { timestamps: true, collection: "knowledgebase" }
);

module.exports = { KnowledgeBase: model("KnowledgeBase", knowledgeBaseSchema) };
