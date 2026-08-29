/**
 * Extract Transcripts (Fase 1 — IA Entrenador)
 * --------------------------------------------------------------------------
 * Baja las transcripciones (subtítulos en español) de cada videolección desde
 * el manifiesto HLS PÚBLICO de Mux (sin credenciales de API) y las guarda en la
 * colección `transcripts`, keyed por `muxPlaybackId`.
 *
 * Fuente de los playbackId: la colección `programs` (lesson.muxPlaybackId).
 * Se deduplican: tia/tia_summer/tia_pool comparten los mismos 25 videos.
 *
 * Cadena (todo público):
 *   GET stream.mux.com/{playbackId}.m3u8   -> URI del grupo SUBTITLES (es)
 *   GET {subtitles.m3u8}                   -> lista de segmentos .vtt
 *   GET cada {n}.vtt                       -> cues; aplica X-TIMESTAMP-MAP y dedup
 *
 * Idempotente: upsert por muxPlaybackId. Dry-run por default.
 *
 * Uso:
 *   node src/scripts/extractTranscripts.js                 # dry-run (no escribe)
 *   node src/scripts/extractTranscripts.js --execute       # escribe en DB
 *   node src/scripts/extractTranscripts.js --only=<pbId>   # un solo video
 *   node src/scripts/extractTranscripts.js --limit=1       # primeros N videos
 *   node src/scripts/extractTranscripts.js --print         # imprime el transcript
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { Program } = require("../models/programModel");
const { Transcript } = require("../models/transcriptModel");

const MUX_STREAM = "https://stream.mux.com";
const FETCH_TIMEOUT_MS = 20000;

// ---------- helpers de red ----------

async function fetchText(url, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: ctrl.signal });
            // 5xx/429 = transitorio (cold-start del gateway) -> reintentar; 4xx = definitivo
            if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status} (transitorio)`);
            if (!res.ok) return Promise.reject(Object.assign(new Error(`HTTP ${res.status} en ${url.slice(0, 80)}`), { fatal: true }));
            return await res.text();
        } catch (err) {
            lastErr = err;
            if (err.fatal || i === attempts - 1) break;
            await new Promise((r) => setTimeout(r, 600 * (i + 1))); // backoff lineal
        } finally {
            clearTimeout(t);
        }
    }
    throw lastErr;
}

function resolveUrl(maybeRelative, baseUrl) {
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    return new URL(maybeRelative, baseUrl).toString();
}

// ---------- parsing HLS / VTT ----------

// "HH:MM:SS.mmm" o "MM:SS.mmm" -> segundos (float)
function tsToSeconds(ts) {
    const parts = ts.trim().split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(parts[0]) || 0;
}

// X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000 -> offset en segundos del segmento.
// Order-agnostic: HLS/Mux pueden emitir LOCAL,MPEGTS o MPEGTS,LOCAL.
function parseTimestampMap(vttText) {
    const line = vttText.match(/X-TIMESTAMP-MAP=([^\n\r]+)/i);
    if (!line) return 0;
    const mpegtsM = line[1].match(/MPEGTS:(\d+)/i);
    if (!mpegtsM) return 0; // sin MPEGTS no se puede calcular el offset
    const localM = line[1].match(/LOCAL:([0-9:.]+)/i);
    const local = localM ? tsToSeconds(localM[1]) : 0;
    const mpegts = Number(mpegtsM[1]) / 90000; // reloj de 90kHz
    return mpegts - local;
}

function cleanCueText(raw) {
    return raw
        .replace(/<[^>]+>/g, "") // tags <c>, <v Speaker>, <00:00:01.000>
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();
}

// Parsea un .vtt -> cues con tiempos ABSOLUTOS (aplica el offset del map, relativo al primero)
function parseVtt(vttText, baseOffset) {
    const offset = parseTimestampMap(vttText) - baseOffset;
    const cues = [];
    const blocks = vttText.replace(/\r/g, "").split(/\n\n+/);
    for (const block of blocks) {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        const tlIdx = lines.findIndex((l) => l.includes("-->"));
        if (tlIdx === -1) continue; // header WEBVTT / NOTE / STYLE
        const [startRaw, restRaw] = lines[tlIdx].split("-->");
        const endRaw = restRaw.trim().split(/\s+/)[0]; // descarta settings (align, position…)
        const start = tsToSeconds(startRaw) + offset;
        const end = tsToSeconds(endRaw) + offset;
        const text = cleanCueText(lines.slice(tlIdx + 1).join(" "));
        if (text) cues.push({ start: round3(start), end: round3(end), text });
    }
    return cues;
}

function round3(n) {
    return Math.round(n * 1000) / 1000;
}

// Elige el track de subtítulos del master: prioriza español.
function pickSubtitleUri(masterText) {
    const mediaLines = masterText
        .split("\n")
        .filter((l) => l.startsWith("#EXT-X-MEDIA:") && /TYPE=SUBTITLES/i.test(l));
    if (mediaLines.length === 0) return null;
    const getUri = (l) => {
        const m = l.match(/URI="([^"]+)"/);
        return m ? m[1] : null;
    };
    const isEs = (l) => /LANGUAGE="es[^"]*"/i.test(l) || /NAME="Spanish"/i.test(l);
    const esLine = mediaLines.find((l) => isEs(l) && getUri(l));
    return getUri(esLine || mediaLines.find((l) => getUri(l)));
}

// ---------- extracción de un video ----------

async function extractOne(playbackId) {
    const masterUrl = `${MUX_STREAM}/${playbackId}.m3u8`;
    const master = await fetchText(masterUrl);

    const subUriRaw = pickSubtitleUri(master);
    if (!subUriRaw) return { ok: false, reason: "sin track de subtítulos" };

    const subUrl = resolveUrl(subUriRaw, masterUrl);
    const subPlaylist = await fetchText(subUrl);
    const segmentUris = subPlaylist
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((rel) => resolveUrl(rel, subUrl));

    if (segmentUris.length === 0) return { ok: false, reason: "playlist de subtítulos vacío" };

    let baseOffset = null;
    let allCues = [];
    for (const segUrl of segmentUris) {
        const vtt = await fetchText(segUrl);
        if (baseOffset === null) baseOffset = parseTimestampMap(vtt);
        allCues = allCues.concat(parseVtt(vtt, baseOffset));
    }

    // Dedup de cues solapados en los bordes de segmento (mismo start+end+text).
    const seen = new Set();
    const cues = [];
    for (const c of allCues.sort((a, b) => a.start - b.start || a.end - b.end)) {
        const key = `${c.start}|${c.end}|${c.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cues.push(c);
    }

    if (cues.length === 0) return { ok: false, reason: "sin cues legibles" };

    const rawText = cues.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
    const durationSec = round3(cues[cues.length - 1].end);
    return { ok: true, segments: cues, rawText, durationSec, language: "es" };
}

// ---------- recolección de videos desde `programs` ----------

async function collectVideos() {
    const programs = await Program.find({}, { id: 1, sections: 1 }).lean();
    const byPlayback = new Map(); // playbackId -> { programIds:Set, lessonIds:Set }
    for (const p of programs) {
        for (const section of p.sections || []) {
            for (const mod of section.modules || []) {
                for (const lesson of mod.lessons || []) {
                    const pb = lesson.muxPlaybackId;
                    if (!pb) continue;
                    if (!byPlayback.has(pb)) byPlayback.set(pb, { programIds: new Set(), lessonIds: new Set() });
                    const entry = byPlayback.get(pb);
                    entry.programIds.add(p.id);
                    entry.lessonIds.add(lesson.id);
                }
            }
        }
    }
    return byPlayback;
}

// ---------- DB ----------

function getDbUrl() {
    if (process.env.DB_URL) return process.env.DB_URL;
    // fallback: parsear .env del repo (dotenv no está en deps)
    try {
        const envRaw = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
        const line = envRaw.split("\n").find((l) => l.trim().startsWith("DB_URL="));
        if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch (_) {}
    return null;
}

// ---------- main ----------

async function main() {
    const EXECUTE = process.argv.includes("--execute");
    const PRINT = process.argv.includes("--print");
    const onlyArg = process.argv.find((a) => a.startsWith("--only="));
    const limitArg = process.argv.find((a) => a.startsWith("--limit="));
    const only = onlyArg ? onlyArg.split("=")[1] : null;
    const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

    const dbUrl = getDbUrl();
    if (!dbUrl) throw new Error("DB_URL no encontrada (env ni .env)");
    const dbName = dbUrl.split("/").pop().split("?")[0];

    console.log("============================================================");
    console.log(`Modo: ${EXECUTE ? "EXECUTE (escribe en DB)" : "DRY-RUN (no escribe)"}`);
    console.log(`Target DB: ${dbName}`);
    console.log("============================================================\n");

    await mongoose.connect(dbUrl);

    const byPlayback = await collectVideos();
    let entries = [...byPlayback.entries()];
    if (only) entries = entries.filter(([pb]) => pb === only);
    if (limit) entries = entries.slice(0, limit);

    console.log(`Videos únicos a procesar: ${entries.length}\n`);

    let ok = 0, failed = 0, written = 0, unchanged = 0;
    for (const [playbackId, meta] of entries) {
        const lessonIds = [...meta.lessonIds].sort();
        const programIds = [...meta.programIds].sort();
        try {
            const r = await extractOne(playbackId);
            if (!r.ok) {
                failed++;
                console.log(`✗ ${playbackId}  [${lessonIds.join(",")}]  → ${r.reason}`);
                continue;
            }
            ok++;
            console.log(`✓ ${playbackId}  [${lessonIds.join(",")}]  ${r.segments.length} cues, ${r.durationSec}s`);
            if (PRINT) console.log(`   "${r.rawText.slice(0, 300)}${r.rawText.length > 300 ? "…" : ""}"\n`);

            if (EXECUTE) {
                // Diff antes de escribir: si el texto no cambió, NO tocar rawText/segments/
                // extractedAt/updatedAt (evita regenerar timestamps en cada corrida).
                const existing = await Transcript.findOne({ muxPlaybackId: playbackId }).lean();
                const sig = (segs) => JSON.stringify((segs || []).map((s) => [s.start, s.end, s.text]));
                const textSame = existing && existing.rawText === r.rawText && sig(existing.segments) === sig(r.segments);
                const arrSame = (a, b) => JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort());
                const metaSame = existing && arrSame(existing.lessonIds, lessonIds) && arrSame(existing.programIds, programIds);

                if (textSame && metaSame) {
                    unchanged++;
                    console.log(`   = sin cambios (no-op)`);
                } else if (textSame && !metaSame) {
                    // solo cambió el mapeo de lecciones/programas: actualizar metadata barata
                    await Transcript.updateOne({ muxPlaybackId: playbackId }, { $set: { programIds, lessonIds } });
                    written++;
                    console.log(`   ~ metadata actualizada (texto sin cambios)`);
                } else {
                    await Transcript.updateOne(
                        { muxPlaybackId: playbackId },
                        {
                            $set: {
                                programIds, lessonIds,
                                language: r.language, source: "mux-hls",
                                durationSec: r.durationSec,
                                rawText: r.rawText, segments: r.segments,
                                extractedAt: new Date(),
                            },
                            $setOnInsert: { fullText: "", chunks: [], cleanup: { applied: false, method: "", glossaryVersion: "" } },
                        },
                        { upsert: true }
                    );
                    written++;
                }
            }
        } catch (err) {
            failed++;
            console.log(`✗ ${playbackId}  [${lessonIds.join(",")}]  → ERROR: ${err.message}`);
        }
    }

    console.log("\n============================================================");
    console.log(`OK: ${ok}   Fallidos: ${failed}   Escritos: ${written}   Sin cambios: ${unchanged}`);
    if (!EXECUTE) console.log("(dry-run — re-correr con --execute para escribir)");
    console.log("============================================================");

    await mongoose.disconnect();
}

module.exports = { extractOne, parseVtt, parseTimestampMap, tsToSeconds, pickSubtitleUri };

if (require.main === module) {
    main().catch((err) => {
        console.error("FAILED:", err);
        process.exit(1);
    });
}
