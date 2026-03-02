/**
 * Mux playback IDs mapped by lessonId.
 * Loaded from MUX_PLAYBACK_IDS env var (JSON object).
 * Format: { "TIAM01L01": "abc123", "TIAM01L02": "def456", ... }
 */

let muxPlaybackIds = {};

try {
  const raw = process.env.MUX_PLAYBACK_IDS;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      muxPlaybackIds = parsed;
    }
  }
} catch (err) {
  console.error("[MuxConfig] Failed to parse MUX_PLAYBACK_IDS:", err.message);
}

const getPlaybackId = (lessonId) => muxPlaybackIds[lessonId] || null;

module.exports = { getPlaybackId, muxPlaybackIds };
