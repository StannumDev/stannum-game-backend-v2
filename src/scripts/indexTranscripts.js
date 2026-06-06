/**
 * Index Transcripts (Fase 2 — IA Entrenador / RAG)
 * --------------------------------------------------------------------------
 * Corta el `fullText` (LIMPIO, de Fase 1.5) en chunks por oraciones y genera el
 * embedding de cada uno (text-embedding-3-small). Los timestamps de cada chunk se
 * derivan anclando la posición de palabra del chunk en `fullText` a los `segments`
 * (que tienen tiempos exactos) → error típico ~1 segmento (~2-5s), tolerable para
 * "saltar al minuto". Usar el texto limpio (no los segments crudos) mejora mucho
 * la calidad de embedding y del contexto que verá el chatbot.
 *
 * Versionado: `indexMeta` (version/embedModel/targetWords) → re-index sólo si cambió
 * (o --force). Evita índices mixtos al cambiar de modelo/parámetros.
 *
 * Uso:
 *   node src/scripts/indexTranscripts.js                  # dry-run (chunkea, no embebe)
 *   node src/scripts/indexTranscripts.js --execute        # embebe + escribe
 *   node src/scripts/indexTranscripts.js --execute --force
 *   node src/scripts/indexTranscripts.js --limit=1 --print
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const OpenAI = require("openai");
const { Transcript } = require("../models/transcriptModel");
const { getLessonContent } = require("../helpers/getLessonContent");

const EMBED_MODEL = process.env.TRAINER_EMBED_MODEL || "text-embedding-3-small";
const INDEX_VERSION = "3"; // v3 = embedding enriquecido con título+topics (v2 = solo fullText)
const TARGET_WORDS = 130; // ~200 tokens por chunk
const OVERLAP_SENTENCES = 1; // solape semántico entre chunks
const EMBED_BATCH = 64; // inputs por request de embeddings

function wordCount(s) {
    return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

function splitSentences(text) {
    const parts = text.match(/[^.!?\n]+[.!?]*(?:\s+|$)/g);
    return (parts && parts.length ? parts : [text]).map((s) => s.trim()).filter(Boolean);
}

/**
 * Chunkea `fullText` por oraciones (~TARGET_WORDS, con solape) y ancla timestamps
 * a `segments` por posición proporcional de palabra (segment-anchored).
 */
function buildChunks(fullText, segments, durationSec) {
    if (!fullText || !fullText.trim()) return [];

    let cum = 0;
    const anchors = (segments || []).map((s) => {
        const w = wordCount(s.text);
        const a = { startWord: cum, endWord: cum + w, start: s.start, end: s.end };
        cum += w;
        return a;
    });
    const totalSegWords = cum || 1;
    const lastEnd = anchors.length ? anchors[anchors.length - 1].end : durationSec || 0;

    const sents = splitSentences(fullText).map((t) => ({ text: t, words: wordCount(t) }));
    const offsets = [];
    let acc = 0;
    for (const s of sents) {
        offsets.push(acc);
        acc += s.words;
    }
    const totalFullWords = acc || 1;

    const wordToTime = (wordPos, edge) => {
        if (!anchors.length) {
            const frac = Math.min(1, Math.max(0, wordPos / totalFullWords));
            return Math.round(frac * (durationSec || 0) * 100) / 100;
        }
        const segPos = (wordPos / totalFullWords) * totalSegWords;
        const a = anchors.find((an) => segPos < an.endWord) || anchors[anchors.length - 1];
        return edge === "end" ? a.end : a.start;
    };

    const chunks = [];
    let i = 0;
    while (i < sents.length) {
        let words = 0, j = i;
        while (j < sents.length && words < TARGET_WORDS) {
            words += sents[j].words;
            j++;
        }
        const text = sents.slice(i, j).map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
        const startWord = offsets[i];
        const endWord = (j < sents.length ? offsets[j] : totalFullWords) - 1;
        if (text) {
            chunks.push({
                idx: chunks.length,
                text,
                startSec: Math.round(wordToTime(startWord, "start") * 100) / 100,
                endSec: Math.round(Math.min(wordToTime(endWord, "end"), lastEnd) * 100) / 100,
            });
        }
        if (j >= sents.length) break;
        i = Math.max(j - OVERLAP_SENTENCES, i + 1);
    }
    return chunks;
}

async function embedWithRetry(openai, inputs, attempts = 3) {
    let lastErr;
    for (let k = 0; k < attempts; k++) {
        try {
            return await openai.embeddings.create({ model: EMBED_MODEL, input: inputs });
        } catch (err) {
            lastErr = err;
            const status = err.status || err.code;
            const retriable = status >= 500 || status === 429 || /timeout|fetch failed|ECONN/i.test(err.message || "");
            if (!retriable || k === attempts - 1) break;
            await new Promise((r) => setTimeout(r, 800 * (k + 1)));
        }
    }
    throw lastErr;
}

// Prefijo de contexto por lección (título + topics del catálogo). Se antepone SOLO al texto
// que se EMBEBE (no al que se guarda en `c.text`), para que conceptos/acrónimos de los topics
// (ej. RACS / R.A.C.S.) sean recuperables aunque el transcript hablado casi no los diga literal.
function buildContextPrefix(t) {
    for (const pid of t.programIds || []) {
        for (const lid of t.lessonIds || []) {
            const c = getLessonContent(pid, lid);
            if (c) {
                const topics = Array.isArray(c.topics) && c.topics.length ? ` Conceptos clave: ${c.topics.join("; ")}.` : "";
                return `${c.title}.${topics}`;
            }
        }
    }
    return "";
}

async function embedChunks(openai, chunks, prefix = "") {
    const out = [];
    for (let s = 0; s < chunks.length; s += EMBED_BATCH) {
        const batch = chunks.slice(s, s + EMBED_BATCH);
        const inputs = batch.map((c) => (prefix ? `${prefix}\n\n${c.text}` : c.text));
        const res = await embedWithRetry(openai, inputs);
        res.data.forEach((d, k) => out.push({ ...batch[k], embedding: d.embedding }));
    }
    return out;
}

function getEnvVar(name) {
    if (process.env[name]) return process.env[name];
    try {
        const envRaw = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
        const line = envRaw.split("\n").find((l) => l.trim().startsWith(`${name}=`));
        if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch (_) {}
    return null;
}

async function main() {
    const EXECUTE = process.argv.includes("--execute");
    const FORCE = process.argv.includes("--force");
    const PRINT = process.argv.includes("--print");
    const onlyArg = process.argv.find((a) => a.startsWith("--only="));
    const limitArg = process.argv.find((a) => a.startsWith("--limit="));
    const only = onlyArg ? onlyArg.split("=")[1] : null;
    const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

    const dbUrl = getEnvVar("DB_URL");
    if (!dbUrl) throw new Error("DB_URL no encontrada");
    const apiKey = getEnvVar("OPENAI_API_KEY");
    if (EXECUTE && !apiKey) throw new Error("OPENAI_API_KEY no encontrada");
    const dbName = dbUrl.split("/").pop().split("?")[0];
    const openai = apiKey ? new OpenAI({ apiKey }) : null;

    console.log("============================================================");
    console.log(`Modo: ${EXECUTE ? "EXECUTE (embebe + escribe)" : "DRY-RUN (chunkea, no embebe)"}`);
    console.log(`DB: ${dbName} | Embed: ${EMBED_MODEL} | idx v${INDEX_VERSION} | ${TARGET_WORDS} palabras/chunk${FORCE ? " | FORCE" : ""}`);
    console.log("============================================================\n");

    await mongoose.connect(dbUrl);

    const filter = {};
    if (only) filter.muxPlaybackId = only;
    let docs = await Transcript.find(filter).lean();
    if (limit) docs = docs.slice(0, limit);

    console.log(`Transcripts a procesar: ${docs.length}\n`);

    let indexed = 0, skipped = 0, failed = 0, written = 0, totalChunks = 0;
    for (const t of docs) {
        const lid = (t.lessonIds || [])[0] || t.muxPlaybackId;
        const meta = t.indexMeta || {};
        const upToDate =
            t.chunks?.length && t.chunks[0]?.embedding?.length &&
            meta.version === INDEX_VERSION && meta.embedModel === EMBED_MODEL && meta.targetWords === TARGET_WORDS;
        if (upToDate && !FORCE) {
            skipped++;
            console.log(`= ${lid}  ya indexado (v${meta.version}, ${t.chunks.length} chunks) — skip`);
            continue;
        }
        if (!t.fullText) {
            failed++;
            console.log(`✗ ${lid}  sin fullText (correr Fase 1.5 primero) — skip`);
            continue;
        }

        try {
            let chunks = buildChunks(t.fullText, t.segments || [], t.durationSec);
            if (chunks.length === 0) {
                failed++;
                console.log(`✗ ${lid}  0 chunks generados`);
                continue;
            }
            totalChunks += chunks.length;
            indexed++;
            console.log(`✓ ${lid}  ${chunks.length} chunks (${t.durationSec}s)`);
            if (PRINT) {
                for (const c of chunks.slice(0, 3)) {
                    console.log(`   [${c.startSec}-${c.endSec}s] "${c.text.slice(0, 90)}…"`);
                }
            }

            if (EXECUTE) {
                const contextPrefix = buildContextPrefix(t);
                chunks = await embedChunks(openai, chunks, contextPrefix);
                await Transcript.updateOne(
                    { muxPlaybackId: t.muxPlaybackId },
                    {
                        $set: {
                            chunks,
                            indexMeta: {
                                version: INDEX_VERSION, embedModel: EMBED_MODEL,
                                targetWords: TARGET_WORDS, source: "fullText", indexedAt: new Date(),
                            },
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
    console.log(`Indexados: ${indexed}   Escritos: ${written}   Saltados: ${skipped}   Fallidos: ${failed}   Chunks: ${totalChunks}`);
    if (!EXECUTE) console.log("(dry-run — re-correr con --execute para embeber y escribir)");
    console.log("============================================================");

    await mongoose.disconnect();
}

module.exports = { buildChunks, splitSentences };

if (require.main === module) {
    main().catch((err) => {
        console.error("FAILED:", err);
        process.exit(1);
    });
}
