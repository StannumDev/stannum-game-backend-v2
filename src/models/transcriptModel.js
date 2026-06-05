const { Schema, model } = require("mongoose");

// Un cue del .vtt, con timestamps ABSOLUTOS (segundos desde el inicio del video).
const segmentSchema = new Schema(
    {
        start: { type: Number, required: true },
        end: { type: Number, required: true },
        text: { type: String, required: true, trim: true },
    },
    { _id: false }
);

// Chunk para RAG (Fase 2). El embedding se completa en indexTranscripts.js.
const chunkSchema = new Schema(
    {
        idx: { type: Number, required: true },
        text: { type: String, required: true },
        startSec: { type: Number, default: 0 },
        endSec: { type: Number, default: 0 },
        embedding: { type: [Number], default: undefined },
    },
    { _id: false }
);

const cleanupSchema = new Schema(
    {
        applied: { type: Boolean, default: false },
        method: { type: String, default: "" }, // "glossary" | "glossary+llm"
        glossaryVersion: { type: String, default: "" },
    },
    { _id: false }
);

/**
 * Transcript de una videolección, keyed por `muxPlaybackId`.
 * Un mismo video puede respaldar varias lecciones/cohortes (tia/tia_summer/tia_pool
 * comparten los mismos playbackId), por eso se denormalizan programIds/lessonIds.
 * NO vive embebido en `programs` a propósito: esa colección se cachea y se sirve al frontend.
 */
const transcriptSchema = new Schema(
    {
        muxPlaybackId: { type: String, required: true, unique: true, trim: true },
        programIds: { type: [String], default: [] },
        lessonIds: { type: [String], default: [] },
        language: { type: String, default: "es" },
        source: { type: String, default: "mux-hls" },
        durationSec: { type: Number, default: 0 },

        rawText: { type: String, default: "" }, // crudo del .vtt (auditoría / re-limpiar)
        fullText: { type: String, default: "" }, // limpio/normalizado (lo que se indexa)
        segments: { type: [segmentSchema], default: [] },
        chunks: { type: [chunkSchema], default: [] },

        cleanup: { type: cleanupSchema, default: () => ({}) },
        indexMeta: {
            type: new Schema(
                {
                    version: { type: String, default: "" },
                    embedModel: { type: String, default: "" },
                    targetWords: { type: Number, default: 0 },
                    source: { type: String, default: "" }, // "fullText" | "segments"
                    indexedAt: { type: Date, default: null },
                },
                { _id: false }
            ),
            default: () => ({}),
        },
        extractedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

transcriptSchema.index({ lessonIds: 1 });

module.exports = { Transcript: model("Transcript", transcriptSchema) };
