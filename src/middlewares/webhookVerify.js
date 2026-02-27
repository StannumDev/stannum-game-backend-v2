const crypto = require("crypto");

const verifyMPWebhook = (req, res, next) => {
  const xSignature = req.headers["x-signature"];
  const xRequestId = req.headers["x-request-id"];

  if (!xSignature || !xRequestId) {
    console.error("[Webhook] Missing x-signature or x-request-id headers");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataId = req.query["data.id"];
  if (!dataId) {
    console.error("[Webhook] Missing data.id query param");
    return res.status(400).json({ error: "Bad request" });
  }

  const parts = {};
  xSignature.split(",").forEach((part) => {
    const [key, value] = part.trim().split("=");
    parts[key] = value;
  });

  const ts = parts["ts"];
  const v1 = parts["v1"];

  if (!ts || !v1) {
    console.error("[Webhook] Malformed x-signature header");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Webhook] MP_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Internal server error" });
  }

  const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", secret).update(template).digest("hex");

  const hmacBuf = Buffer.from(hmac, "hex");
  const v1Buf = Buffer.from(v1, "hex");
  if (hmacBuf.length !== v1Buf.length || !crypto.timingSafeEqual(hmacBuf, v1Buf)) {
    console.error("[Webhook] HMAC verification failed");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const timestampAge = Date.now() - parseInt(ts, 10) * 1000;
  if (timestampAge > 5 * 60 * 1000 || timestampAge < -30 * 1000) {
    console.error("[Webhook] Timestamp out of range:", timestampAge, "ms");
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};

module.exports = { verifyMPWebhook };
