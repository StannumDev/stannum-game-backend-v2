const crypto = require("crypto");
const nodemailer = require("nodemailer");
const FailedEmail = require("../models/failedEmailModel");
const Feedback = require("../models/feedbackModel");

const smtpTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const DEDUPE_MAX_ENTRIES = 1000;
const recentAlerts = new Map();

const pruneDedupeMap = () => {
  if (recentAlerts.size <= DEDUPE_MAX_ENTRIES) return;
  const cutoff = Date.now() - DEDUPE_WINDOW_MS;
  for (const [key, ts] of recentAlerts) {
    if (ts < cutoff) recentAlerts.delete(key);
  }
};

const computeStackHash = (stack) => {
  if (!stack) return null;
  return crypto.createHash("sha256").update(stack.slice(0, 2000)).digest("hex").slice(0, 16);
};

const sanitizeRouteForSubject = (route) => {
  if (!route) return "unknown";
  return String(route)
    .replace(/\/[0-9a-f]{24}/gi, "/:id")
    .replace(/\/\d+/g, "/:id")
    .replace(/\?.*$/, "")
    .slice(0, 100);
};

const escapeHtml = (str) => {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const buildErrorEmailHtml = (feedback) => {
  const ep = feedback.errorPayload || {};
  const ctx = feedback.context || {};
  const userLine = feedback.userId
    ? `<tr><td style="padding:8px 12px;color:#ffffff80;font-size:13px;">User ID</td><td style="padding:8px 12px;color:#fff;font-size:13px;font-family:monospace;">${escapeHtml(feedback.userId)}</td></tr>`
    : `<tr><td style="padding:8px 12px;color:#ffffff80;font-size:13px;">User</td><td style="padding:8px 12px;color:#ffffff60;font-size:13px;font-style:italic;">Anónimo</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#1f1f1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1f1f1f;padding:24px 16px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#2a2a2a;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#3a1a1a,#2a2a2a);">
          <div style="font-size:18px;font-weight:800;color:#ff6b6b;">STANNUM · ERROR</div>
          <div style="font-size:11px;color:#ffffff60;letter-spacing:1px;">Captura silenciosa de error 5xx / cliente</div>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1f1f1f;border-radius:8px;margin-bottom:16px;">
            <tr><td style="padding:8px 12px;color:#ffffff80;font-size:13px;">Status</td><td style="padding:8px 12px;color:#fff;font-size:13px;font-weight:700;">${escapeHtml(ep.statusCode ?? "n/a")}</td></tr>
            <tr><td style="padding:8px 12px;color:#ffffff80;font-size:13px;">Ruta</td><td style="padding:8px 12px;color:#fff;font-size:13px;font-family:monospace;">${escapeHtml(ep.route || ctx.route || "n/a")}</td></tr>
            ${userLine}
            <tr><td style="padding:8px 12px;color:#ffffff80;font-size:13px;">App version</td><td style="padding:8px 12px;color:#fff;font-size:13px;font-family:monospace;">${escapeHtml(ctx.appVersion || "n/a")}</td></tr>
            <tr><td style="padding:8px 12px;color:#ffffff80;font-size:13px;">Timestamp</td><td style="padding:8px 12px;color:#fff;font-size:13px;">${new Date(feedback.createdAt || Date.now()).toISOString()}</td></tr>
            <tr><td style="padding:8px 12px;color:#ffffff80;font-size:13px;">User agent</td><td style="padding:8px 12px;color:#ffffff90;font-size:11px;font-family:monospace;">${escapeHtml((ctx.userAgent || "n/a").slice(0, 200))}</td></tr>
          </table>
          <div style="color:#ffffff80;font-size:13px;margin:16px 0 6px;font-weight:600;">Mensaje</div>
          <div style="background:#1f1f1f;border-radius:8px;padding:12px;color:#ff9b9b;font-size:13px;font-family:monospace;white-space:pre-wrap;">${escapeHtml(ep.message || "(sin mensaje)")}</div>
          <div style="color:#ffffff80;font-size:13px;margin:16px 0 6px;font-weight:600;">Stack trace</div>
          <div style="background:#1f1f1f;border-radius:8px;padding:12px;color:#ffffffb3;font-size:11px;font-family:monospace;white-space:pre-wrap;line-height:1.5;max-height:400px;overflow:auto;">${escapeHtml((ep.stack || "(sin stack)").slice(0, 4000))}</div>
        </td></tr>
        <tr><td style="padding:14px 32px;background:#1a1a1a;text-align:center;">
          <p style="color:#ffffff30;font-size:11px;margin:0;">Stannum Game · alerta automática · feedback ID ${escapeHtml(String(feedback._id || ""))}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const getRecipients = () => {
  const raw = process.env.FEEDBACK_NOTIFICATION_EMAILS || "";
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);
};

const sendErrorAlert = async (feedback) => {
  try {
    const recipients = getRecipients();
    if (recipients.length === 0) {
      console.warn("[FeedbackEmail] FEEDBACK_NOTIFICATION_EMAILS vacío, no se envía alerta.");
      return;
    }

    const ep = feedback.errorPayload || {};
    const hash = ep.stackHash || computeStackHash(ep.stack);
    if (hash) {
      const lastSent = recentAlerts.get(hash);
      if (lastSent && Date.now() - lastSent < DEDUPE_WINDOW_MS) return;

      try {
        const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS);
        const existing = await Feedback.findOne({
          type: "error",
          "errorPayload.stackHash": hash,
          createdAt: { $gte: cutoff },
          _id: { $ne: feedback._id },
        }).select("_id").lean();
        if (existing) {
          recentAlerts.set(hash, Date.now());
          return;
        }
      } catch (dbErr) {
        console.warn("[FeedbackEmail] dedupe DB query falló:", dbErr.message);
      }

      recentAlerts.set(hash, Date.now());
      pruneDedupeMap();
    }

    const route = sanitizeRouteForSubject(ep.route || feedback.context?.route);
    const subject = `[Stannum] Error ${ep.statusCode || "5xx"} en ${route}`;
    const html = buildErrorEmailHtml(feedback);
    const to = recipients.join(",");

    try {
      await smtpTransporter.sendMail({
        from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
        to,
        subject,
        html,
      });
      console.info(`[FeedbackEmail] Alerta enviada a ${to}: ${subject}`);
    } catch (err) {
      console.error(`[FeedbackEmail] Falló envío a ${to}:`, err.message);
      FailedEmail.create({
        to,
        subject,
        html,
        lastError: err.message,
      }).catch(dbErr => console.error("[FeedbackEmail] Falló persistir failed email:", dbErr.message));
    }
  } catch (err) {
    console.error("[FeedbackEmail] Error en sendErrorAlert:", err.message);
  }
};

module.exports = { sendErrorAlert, computeStackHash };
