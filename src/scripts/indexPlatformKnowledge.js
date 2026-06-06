/**
 * Index Platform Knowledge — corpus GLOBAL de la plataforma para STAN.
 * --------------------------------------------------------------------------
 * Lee src/config/platformKnowledge.json (artículos curados para alumnos), chunkea cada
 * artículo por oraciones (~130 palabras, SIN timestamps), embebe `${title}\n\n${chunk}`
 * (prefijo de título, paridad con el index v3 de transcripts) y upserta en la colección
 * `knowledgebase`. Idempotente por meta.version + embedModel + texto (re-embebe si editás el JSON).
 *
 * Uso:
 *   node src/scripts/indexPlatformKnowledge.js              # dry-run (chunkea + imprime, NO escribe)
 *   node src/scripts/indexPlatformKnowledge.js --execute    # embebe + escribe
 *   node src/scripts/indexPlatformKnowledge.js --execute --force
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const OpenAI = require("openai");
const { KnowledgeBase } = require("../models/knowledgeBaseModel");
const { TRAINER_EMBED_MODEL } = require("../config/aiConfig");

const EMBED_MODEL = TRAINER_EMBED_MODEL;
const KB_VERSION = "1";
const TARGET_WORDS = 130;
const EMBED_BATCH = 64;
const SOURCE = path.join(__dirname, "..", "config", "platformKnowledge.json");

function getEnvVar(name) {
    if (process.env[name]) return process.env[name];
    try {
        const envRaw = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
        const line = envRaw.split("\n").find((l) => l.trim().startsWith(`${name}=`));
        if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch (_) {}
    return null;
}

// Chunker por oraciones, sin timestamps (el KB no es un video).
function chunkText(text, target = TARGET_WORDS) {
    const sents = String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    const chunks = [];
    let buf = [], words = 0;
    for (const s of sents) {
        const sw = s.split(/\s+/).length;
        if (words + sw > target && buf.length) { chunks.push(buf.join(" ")); buf = []; words = 0; }
        buf.push(s); words += sw;
    }
    if (buf.length) chunks.push(buf.join(" "));
    return chunks.length ? chunks : [String(text || "").trim()];
}

async function embedWithRetry(openai, inputs, attempts = 3) {
    for (let i = 1; i <= attempts; i++) {
        try { return await openai.embeddings.create({ model: EMBED_MODEL, input: inputs }); }
        catch (e) { if (i === attempts) throw e; await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 8000))); }
    }
}

async function main() {
    const EXECUTE = process.argv.includes("--execute");
    const FORCE = process.argv.includes("--force");

    const dbUrl = getEnvVar("DB_URL");
    if (!dbUrl) throw new Error("DB_URL no encontrada");
    const apiKey = getEnvVar("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY no encontrada");
    const openai = new OpenAI({ apiKey });

    const raw = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
    const articles = Array.isArray(raw.articles) ? raw.articles : [];
    const dbName = dbUrl.split("/").pop().split("?")[0];

    console.log("============================================================");
    console.log(`Modo: ${EXECUTE ? "EXECUTE (embebe + escribe)" : "DRY-RUN (no escribe)"}`);
    console.log(`DB: ${dbName} | Embed: ${EMBED_MODEL} | kb v${KB_VERSION}${FORCE ? " | FORCE" : ""}`);
    console.log(`Artículos en JSON: ${articles.length}`);
    console.log("============================================================\n");

    await mongoose.connect(dbUrl);

    let done = 0, skipped = 0, written = 0, pending = 0;
    for (const art of articles) {
        if (!art.key || !art.title) { console.log(`✗ artículo sin key/title — skip`); continue; }
        const isPending = /^\s*\[PENDIENTE/i.test(art.text || "");
        if (isPending) { pending++; console.log(`… ${art.key}  PENDIENTE (lo completa el dueño) — skip`); continue; }

        const existing = await KnowledgeBase.findOne({ key: art.key }).lean();
        const upToDate = existing && existing.chunks?.length
            && existing.meta?.version === KB_VERSION && existing.meta?.embedModel === EMBED_MODEL
            && existing.text === art.text;
        if (upToDate && !FORCE) { skipped++; console.log(`= ${art.key}  sin cambios — skip`); continue; }

        const parts = chunkText(art.text);
        done++;
        console.log(`✓ ${art.key}  ${parts.length} chunk(s) — "${art.title}"`);

        if (EXECUTE) {
            const res = await embedWithRetry(openai, parts.map((p) => `${art.title}\n\n${p}`));
            const chunks = parts.map((text, k) => ({ text, embedding: res.data[k].embedding }));
            await KnowledgeBase.updateOne(
                { key: art.key },
                { $set: { title: art.title, text: art.text, chunks, meta: { version: KB_VERSION, embedModel: EMBED_MODEL, indexedAt: new Date() } } },
                { upsert: true }
            );
            written++;
        }
    }

    console.log(`\n============================================================`);
    console.log(`Procesados: ${done}   Escritos: ${written}   Saltados: ${skipped}   Pendientes: ${pending}`);
    if (!EXECUTE) console.log(`(dry-run — re-correr con --execute para escribir)`);
    console.log(`============================================================`);
    await mongoose.disconnect();
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
