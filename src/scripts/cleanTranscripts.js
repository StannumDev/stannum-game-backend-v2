/**
 * Clean Transcripts (Fase 1.5 — IA Entrenador)
 * --------------------------------------------------------------------------
 * Limpia los transcripts crudos (`rawText`) en dos niveles y guarda el
 * resultado en `fullText` (lo que después se chunkea/indexa en Fase 2):
 *   1) Glosario determinístico (marca/nombres): src/config/transcriptGlossary.json
 *   2) Pasada LLM (gpt-4o-mini): corrige ASR, acentos, puntuación y palabras
 *      partidas SIN cambiar el sentido, usando title/topics de la lección como
 *      contexto (de lessons_catalog.json).
 *
 * NO toca `rawText` ni `segments` (se preservan para auditar / re-limpiar).
 * Idempotente: salta los ya limpiados con la misma versión de glosario (salvo --force).
 *
 * Uso:
 *   node src/scripts/cleanTranscripts.js                 # dry-run (llama LLM, no escribe)
 *   node src/scripts/cleanTranscripts.js --execute       # escribe fullText en DB
 *   node src/scripts/cleanTranscripts.js --only=<pbId>   # un solo video
 *   node src/scripts/cleanTranscripts.js --limit=1 --print
 *   node src/scripts/cleanTranscripts.js --execute --force   # re-limpia todo
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const OpenAI = require("openai");
const { Transcript } = require("../models/transcriptModel");
const glossary = require("../config/transcriptGlossary.json");
const { getLessonContent } = require("../helpers/getLessonContent");

const CLEAN_MODEL = process.env.TRAINER_CLEAN_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `Sos un corrector de transcripciones automáticas (ASR) en español de videolecciones de STANNUM Game (plataforma de entrenamiento gamificada).

TU TAREA: devolver el MISMO texto, corregido. Reglas ESTRICTAS:
- Corregí errores de transcripción, ortografía, acentos y signos de puntuación.
- Uní palabras partidas por el subtitulado (ej: "bien venida" → "bienvenida", "pil oto" → "piloto").
- NO cambies el sentido, NO resumas, NO agregues ni elimines ideas, NO traduzcas, NO inventes.
- NO agregues encabezados, comillas, viñetas ni comentarios.
- Mantené el estilo hablado y el español rioplatense/neutro tal cual.
- Respetá los nombres propios y de marca (ya normalizados): STANNUM Game, Trenno, Trenno IA, Martín Merlini.
- Devolvé SOLO el texto corregido.`;

// ---------- glosario ----------

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyGlossary(text) {
    let out = text;
    for (const { from, to } of glossary.replacements) {
        const re = new RegExp(`\\b${escapeRegex(from)}\\b`, "gi");
        out = out.replace(re, to);
    }
    return out;
}

// ---------- contexto de la lección (title + topics) ----------

function getLessonContext(transcript) {
    for (const programId of transcript.programIds || []) {
        for (const lessonId of transcript.lessonIds || []) {
            const c = getLessonContent(programId, lessonId);
            if (c) return c; // { id, title, topics }
        }
    }
    return null;
}

// ---------- pasada LLM ----------

async function cleanWithLLM(openai, glossedText, context) {
    const parts = [];
    if (context) {
        parts.push(`Lección: ${context.title}`);
        if (Array.isArray(context.topics) && context.topics.length) {
            parts.push(`Temas que cubre: ${context.topics.join("; ")}`);
        }
        parts.push("");
    }
    parts.push("Transcripción a corregir:");
    parts.push(glossedText);

    const response = await openai.responses.create({
        model: CLEAN_MODEL,
        temperature: 0.2,
        max_output_tokens: 8192,
        instructions: SYSTEM_PROMPT,
        input: [{ role: "user", content: [{ type: "input_text", text: parts.join("\n") }] }],
    });

    const text = response.output?.[0]?.content?.[0]?.text || response.output_text;
    if (!text) throw new Error("OpenAI no devolvió texto");
    return text.trim();
}

// ---------- env / db ----------

function getEnvVar(name) {
    if (process.env[name]) return process.env[name];
    try {
        const envRaw = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
        const line = envRaw.split("\n").find((l) => l.trim().startsWith(`${name}=`));
        if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch (_) {}
    return null;
}

// ---------- main ----------

async function main() {
    const EXECUTE = process.argv.includes("--execute");
    const FORCE = process.argv.includes("--force");
    const PRINT = process.argv.includes("--print");
    const onlyArg = process.argv.find((a) => a.startsWith("--only="));
    const limitArg = process.argv.find((a) => a.startsWith("--limit="));
    const only = onlyArg ? onlyArg.split("=")[1] : null;
    const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

    const dbUrl = getEnvVar("DB_URL");
    const apiKey = getEnvVar("OPENAI_API_KEY");
    if (!dbUrl) throw new Error("DB_URL no encontrada");
    if (!apiKey) throw new Error("OPENAI_API_KEY no encontrada");
    const dbName = dbUrl.split("/").pop().split("?")[0];
    const openai = new OpenAI({ apiKey });

    console.log("============================================================");
    console.log(`Modo: ${EXECUTE ? "EXECUTE (escribe en DB)" : "DRY-RUN (llama LLM, no escribe)"}`);
    console.log(`Target DB: ${dbName} | Modelo: ${CLEAN_MODEL} | Glosario v${glossary.version}${FORCE ? " | FORCE" : ""}`);
    console.log("============================================================\n");

    await mongoose.connect(dbUrl);

    const filter = {};
    if (only) filter.muxPlaybackId = only;
    let docs = await Transcript.find(filter).lean();
    if (limit) docs = docs.slice(0, limit);

    console.log(`Transcripts a procesar: ${docs.length}\n`);

    let cleaned = 0, skipped = 0, failed = 0, written = 0;
    for (const t of docs) {
        const lid = (t.lessonIds || [])[0] || t.muxPlaybackId;
        const alreadyClean = t.cleanup?.applied && t.cleanup?.glossaryVersion === glossary.version;
        if (alreadyClean && !FORCE) {
            skipped++;
            console.log(`= ${lid}  ya limpio (glosario v${t.cleanup.glossaryVersion}) — skip`);
            continue;
        }

        try {
            const glossed = applyGlossary(t.rawText || "");
            const ctx = getLessonContext(t);
            const full = await cleanWithLLM(openai, glossed, ctx);

            // Salvaguarda anti-resumen: si el LLM devolvió mucho menos texto, sospechar truncado.
            const ratio = full.length / Math.max(1, glossed.length);
            if (ratio < 0.6) {
                failed++;
                console.log(`✗ ${lid}  LLM devolvió ${Math.round(ratio * 100)}% del largo (posible resumen/truncado) — NO se escribe`);
                continue;
            }

            cleaned++;
            console.log(`✓ ${lid}  ${ctx ? `[ctx: ${ctx.title.slice(0, 40)}…]` : "[sin ctx]"}  raw ${t.rawText.length} → full ${full.length} chars`);
            if (PRINT) console.log(`   "${full.slice(0, 320)}${full.length > 320 ? "…" : ""}"\n`);

            if (EXECUTE) {
                await Transcript.updateOne(
                    { muxPlaybackId: t.muxPlaybackId },
                    {
                        $set: {
                            fullText: full,
                            cleanup: { applied: true, method: "glossary+llm", glossaryVersion: glossary.version },
                        },
                    }
                );
                written++;
            }
        } catch (err) {
            failed++;
            console.log(`✗ ${lid}  ERROR: ${err.message}`);
        }
    }

    console.log("\n============================================================");
    console.log(`Limpiados: ${cleaned}   Escritos: ${written}   Saltados: ${skipped}   Fallidos: ${failed}`);
    if (!EXECUTE) console.log("(dry-run — re-correr con --execute para escribir)");
    console.log("============================================================");

    await mongoose.disconnect();
}

module.exports = { applyGlossary, getLessonContext };

if (require.main === module) {
    main().catch((err) => {
        console.error("FAILED:", err);
        process.exit(1);
    });
}
