/**
 * Generate Chapters — Línea de tiempo por topics (Entrenador IA)
 * --------------------------------------------------------------------------
 * Le pone un `startSec` a cada TOPIC curado de la lección, emparejándolo con el
 * chunk del transcript de mayor similitud coseno (los chunks ya tienen embedding
 * tras indexTranscripts v3). El resultado es `transcripts.chapters[{title,startSec}]`
 * ordenado cronológicamente: la "línea de tiempo por topics" que ve el alumno.
 *
 * NO usa LLM (evita timestamps alucinados): topics curados + embeddings reales.
 * Idempotente: versionado `chaptersMeta` (version/embedModel) → re-genera sólo si cambió.
 *
 * Uso:
 *   node src/scripts/generateChapters.js                 # dry-run (embebe + calcula + imprime, NO escribe)
 *   node src/scripts/generateChapters.js --execute       # escribe a la DB
 *   node src/scripts/generateChapters.js --only=<muxId>  # un solo transcript
 *   node src/scripts/generateChapters.js --execute --force
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const OpenAI = require("openai");
const { Transcript } = require("../models/transcriptModel");
const { getLessonContent } = require("../helpers/getLessonContent");
const { TRAINER_EMBED_MODEL } = require("../config/aiConfig");

const EMBED_MODEL = TRAINER_EMBED_MODEL;
const CHAPTERS_VERSION = "1"; // bumpear si cambia el método de generación
const EMBED_BATCH = 64;

function getEnvVar(name) {
    if (process.env[name]) return process.env[name];
    try {
        const envRaw = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
        const line = envRaw.split("\n").find((l) => l.trim().startsWith(`${name}=`));
        if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch (_) {}
    return null;
}

function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedWithRetry(openai, inputs, attempts = 3) {
    for (let i = 1; i <= attempts; i++) {
        try {
            return await openai.embeddings.create({ model: EMBED_MODEL, input: inputs });
        } catch (e) {
            if (i === attempts) throw e;
            await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 8000)));
        }
    }
}

async function embedTexts(openai, texts) {
    const out = [];
    for (let s = 0; s < texts.length; s += EMBED_BATCH) {
        const res = await embedWithRetry(openai, texts.slice(s, s + EMBED_BATCH));
        res.data.forEach((d) => out.push(d.embedding));
    }
    return out;
}

// Topics curados de la lección (primer match programId×lessonId en el catálogo).
function resolveTopics(t) {
    for (const pid of t.programIds || []) {
        for (const lid of t.lessonIds || []) {
            const c = getLessonContent(pid, lid);
            if (c && Array.isArray(c.topics) && c.topics.length) return c.topics;
        }
    }
    return [];
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

async function main() {
    const EXECUTE = process.argv.includes("--execute");
    const FORCE = process.argv.includes("--force");
    const onlyArg = process.argv.find((a) => a.startsWith("--only="));
    const only = onlyArg ? onlyArg.split("=")[1] : null;

    const dbUrl = getEnvVar("DB_URL");
    if (!dbUrl) throw new Error("DB_URL no encontrada");
    const apiKey = getEnvVar("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY no encontrada");
    const openai = new OpenAI({ apiKey });
    const dbName = dbUrl.split("/").pop().split("?")[0];

    console.log("============================================================");
    console.log(`Modo: ${EXECUTE ? "EXECUTE (escribe)" : "DRY-RUN (calcula + imprime, NO escribe)"}`);
    console.log(`DB: ${dbName} | Embed: ${EMBED_MODEL} | chapters v${CHAPTERS_VERSION}${FORCE ? " | FORCE" : ""}`);
    console.log("============================================================\n");

    await mongoose.connect(dbUrl);
    const filter = only ? { muxPlaybackId: only } : {};
    const docs = await Transcript.find(filter).lean();
    console.log(`Transcripts: ${docs.length}\n`);

    let done = 0, skipped = 0, failed = 0, written = 0;
    for (const t of docs) {
        const lid = (t.lessonIds || [])[0] || t.muxPlaybackId;
        const meta = t.chaptersMeta || {};
        const upToDate = t.chapters?.length && meta.version === CHAPTERS_VERSION && meta.embedModel === EMBED_MODEL;
        if (upToDate && !FORCE) { skipped++; console.log(`= ${lid}  ya tiene capítulos (v${meta.version}) — skip`); continue; }

        const topics = resolveTopics(t);
        const chunks = (t.chunks || []).filter((c) => c.embedding && c.embedding.length);
        if (!topics.length) { failed++; console.log(`✗ ${lid}  sin topics en el catálogo — skip`); continue; }
        if (!chunks.length) { failed++; console.log(`✗ ${lid}  sin chunks con embedding (correr indexTranscripts) — skip`); continue; }

        try {
            const maxSec = t.durationSec || (t.segments?.length ? t.segments[t.segments.length - 1].end : Infinity);
            const tvecs = await embedTexts(openai, topics);
            // Matching greedy con chunks DISTINTOS: evita que varios topics caigan en el mismo minuto.
            const pairs = [];
            for (let ti = 0; ti < topics.length; ti++)
                for (let ci = 0; ci < chunks.length; ci++)
                    pairs.push({ ti, ci, s: cosine(tvecs[ti], chunks[ci].embedding) });
            pairs.sort((a, b) => b.s - a.s);
            const pick = new Array(topics.length).fill(null);
            const usedChunk = new Set();
            let assigned = 0;
            for (const p of pairs) {
                if (assigned === topics.length) break;
                if (pick[p.ti] !== null || usedChunk.has(p.ci)) continue;
                pick[p.ti] = chunks[p.ci];
                usedChunk.add(p.ci);
                assigned++;
            }
            let chapters = topics.map((title, i) => {
                const best = pick[i] || chunks[0]; // fallback si hay más topics que chunks
                let startSec = Math.round(best.startSec || 0);
                if (startSec < 0) startSec = 0;
                if (Number.isFinite(maxSec) && startSec > maxSec) startSec = Math.round(maxSec);
                return { title, startSec };
            });
            chapters.sort((a, b) => a.startSec - b.startSec);

            done++;
            console.log(`✓ ${lid}  ${chapters.length} capítulos:`);
            for (const c of chapters) console.log(`     ${fmt(c.startSec)}  ${c.title}`);

            if (EXECUTE) {
                await Transcript.updateOne(
                    { muxPlaybackId: t.muxPlaybackId },
                    { $set: { chapters, chaptersMeta: { version: CHAPTERS_VERSION, embedModel: EMBED_MODEL, generatedAt: new Date() } } }
                );
                written++;
            }
        } catch (e) {
            failed++;
            console.log(`✗ ${lid}  error: ${e.message}`);
        }
    }

    console.log(`\n============================================================`);
    console.log(`Procesados: ${done}   Escritos: ${written}   Saltados: ${skipped}   Fallidos: ${failed}`);
    if (!EXECUTE) console.log(`(dry-run — re-correr con --execute para escribir)`);
    console.log(`============================================================`);
    await mongoose.disconnect();
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
