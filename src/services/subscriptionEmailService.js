const nodemailer = require("nodemailer");
const User = require("../models/userModel");
const FailedEmail = require("../models/failedEmailModel");

const smtpTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Simple in-memory queue with rate limiting (10 emails/min for Gmail safety)
const emailQueue = [];
let isProcessing = false;
const RATE_LIMIT_MS = 6000; // 1 email every 6 seconds = 10/min

const MAX_QUEUE_SIZE = 500;

const enqueueEmail = (to, subject, html, attachments = [], receiptData = null) => {
  if (!to) {
    console.warn('[SubscriptionEmail] Skipping email — no recipient address');
    return;
  }
  if (emailQueue.length >= MAX_QUEUE_SIZE) {
    console.error('[SubscriptionEmail] Queue full, dropping email to:', to);
    return;
  }
  emailQueue.push({ to, subject, html, attachments, receiptData });
  processQueue();
};

const processQueue = async () => {
  if (isProcessing || emailQueue.length === 0) return;
  isProcessing = true;

  while (emailQueue.length > 0) {
    const email = emailQueue.shift();
    try {
      const result = await smtpTransporter.sendMail({
        from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
        to: email.to,
        subject: email.subject,
        html: email.html,
        ...(email.attachments?.length > 0 && { attachments: email.attachments }),
      });
      console.info(`[SubscriptionEmail] Sent to ${email.to}: ${email.subject}`);
    } catch (err) {
      console.error(`[SubscriptionEmail] Failed to send to ${email.to}:`, err.message);
      // HIGH-02 fix: Persist failed emails to DB for retry via cron
      FailedEmail.create({
        to: email.to,
        subject: email.subject,
        html: email.html,
        lastError: err.message,
        ...(email.receiptData && { receiptData: email.receiptData }),
      }).catch(dbErr => console.error('[SubscriptionEmail] Failed to persist failed email:', dbErr.message));
    }
    if (emailQueue.length > 0) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  isProcessing = false;
};

// --- Shared template wrapper ---
const wrap = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#1f1f1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1f1f1f;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#2a2a2a;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 40px;background:linear-gradient(135deg,#1a1a1a,#2a2a2a);">
          <div style="font-size:20px;font-weight:800;color:#00FFCC;margin-bottom:4px;">STANNUM</div>
          <div style="font-size:11px;color:#ffffff60;letter-spacing:1px;">GAME</div>
        </td></tr>
        <tr><td style="padding:40px;">${content}</td></tr>
        <tr><td style="padding:20px 40px;background:#1a1a1a;text-align:center;">
          <p style="color:#ffffff30;font-size:11px;margin:0;">
            ¿Querés cancelar tu suscripción? Podés hacerlo desde <a href="${process.env.FRONTEND_URL}/dashboard/subscriptions" style="color:#00FFCC;">Mis Suscripciones</a>
          </p>
          <p style="color:#ffffff20;font-size:10px;margin:8px 0 0;">
            <a href="${process.env.FRONTEND_URL}/terminos" style="color:#ffffff30;">Términos</a> ·
            <a href="${process.env.FRONTEND_URL}/privacidad" style="color:#ffffff30;">Privacidad</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const formatARS = (amount) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(amount);

const formatDate = (date) =>
  new Date(date).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

// --- 1. Subscription activated ---
const sendSubscriptionActivatedEmail = (email, programName, priceARS) => {
  enqueueEmail(email, `¡Suscripción activa! — ${programName}`, wrap(`
    <h1 style="color:#fff;font-size:24px;margin:0 0 16px;">¡Tu suscripción está activa!</h1>
    <p style="color:#ffffffb3;font-size:14px;line-height:1.6;">
      Tu suscripción a <strong style="color:#fff;">${programName}</strong> fue activada correctamente.
      Ya podés acceder a todo el contenido del programa.
    </p>
    <table style="margin:24px 0;width:100%;background:#1f1f1f;border-radius:8px;">
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Programa</td><td style="padding:16px 20px;color:#fff;font-size:13px;text-align:right;font-weight:600;">${programName}</td></tr>
      <tr><td style="padding:0 20px;"><hr style="border:none;border-top:1px solid #ffffff10;"></td><td></td></tr>
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Precio mensual</td><td style="padding:16px 20px;color:#fff;font-size:13px;text-align:right;font-weight:600;">${formatARS(priceARS)}</td></tr>
    </table>
    <a href="${process.env.FRONTEND_URL}/dashboard" style="display:inline-block;background:#00FFCC;color:#000;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;">Ir a STANNUM Game</a>
  `));
};

// --- 2. Monthly payment successful ---
const sendPaymentSuccessEmail = (email, programName, amount, nextDate, pdfAttachment = null, receiptData = null) => {
  const attachments = pdfAttachment ? [pdfAttachment] : [];
  enqueueEmail(email, `Cobro exitoso — ${programName}`, wrap(`
    <h1 style="color:#fff;font-size:24px;margin:0 0 16px;">Cobro procesado correctamente</h1>
    <p style="color:#ffffffb3;font-size:14px;line-height:1.6;">
      Tu pago mensual de <strong style="color:#fff;">${programName}</strong> fue procesado exitosamente.
    </p>
    <table style="margin:24px 0;width:100%;background:#1f1f1f;border-radius:8px;">
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Monto</td><td style="padding:16px 20px;color:#fff;font-size:13px;text-align:right;font-weight:600;">${formatARS(amount)}</td></tr>
      <tr><td style="padding:0 20px;"><hr style="border:none;border-top:1px solid #ffffff10;"></td><td></td></tr>
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Próximo cobro</td><td style="padding:16px 20px;color:#fff;font-size:13px;text-align:right;font-weight:600;">${formatDate(nextDate)}</td></tr>
    </table>
    <p style="color:#ffffff60;font-size:12px;margin-top:8px;">Encontrás el comprobante de pago adjunto a este email.</p>
  `), attachments, receiptData);
};

// --- Purchase confirmation email (one-time) ---
const sendPurchaseConfirmationEmail = (email, programName, order, pdfAttachment = null, receiptData = null) => {
  const attachments = pdfAttachment ? [pdfAttachment] : [];
  const typeLabel = order.type === "gift" ? "Regalo" : "Compra personal";
  enqueueEmail(email, `Comprobante de pago — ${programName}`, wrap(`
    <h1 style="color:#fff;font-size:24px;margin:0 0 16px;">¡Compra confirmada!</h1>
    <p style="color:#ffffffb3;font-size:14px;line-height:1.6;">
      Tu compra de <strong style="color:#fff;">${programName}</strong> fue procesada exitosamente.
    </p>
    <table style="margin:24px 0;width:100%;background:#1f1f1f;border-radius:8px;">
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Programa</td><td style="padding:16px 20px;color:#fff;font-size:13px;text-align:right;font-weight:600;">${programName}</td></tr>
      <tr><td style="padding:0 20px;"><hr style="border:none;border-top:1px solid #ffffff10;"></td><td></td></tr>
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Tipo</td><td style="padding:16px 20px;color:#fff;font-size:13px;text-align:right;font-weight:600;">${typeLabel}</td></tr>
      <tr><td style="padding:0 20px;"><hr style="border:none;border-top:1px solid #ffffff10;"></td><td></td></tr>
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Total</td><td style="padding:16px 20px;color:#00FFCC;font-size:13px;text-align:right;font-weight:600;">${formatARS(order.finalAmount)}</td></tr>
    </table>
    <p style="color:#ffffff60;font-size:12px;margin-top:8px;">Encontrás el comprobante de pago adjunto a este email.</p>
    <a href="${process.env.FRONTEND_URL}/dashboard/billing" style="display:inline-block;background:#00FFCC;color:#000;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;margin-top:16px;">Ver mis compras</a>
  `), attachments, receiptData);
};

// --- 3. Payment rejected ---
const sendPaymentRejectedEmail = (email, programName, retryAttempt) => {
  const urgencyMessages = [
    "Tu último pago no pudo ser procesado. Se reintentará automáticamente.",
    "El segundo intento de cobro también fue rechazado. Verificá tu medio de pago.",
    "Tercer intento de cobro rechazado. Tu suscripción puede cancelarse si no se resuelve.",
    "Último aviso: tu suscripción será cancelada si el próximo cobro falla.",
  ];
  const message = urgencyMessages[Math.min(retryAttempt - 1, urgencyMessages.length - 1)];

  enqueueEmail(email, `Cobro rechazado — ${programName}`, wrap(`
    <h1 style="color:#ff6b6b;font-size:24px;margin:0 0 16px;">Cobro rechazado</h1>
    <p style="color:#ffffffb3;font-size:14px;line-height:1.6;">${message}</p>
    <p style="color:#ffffff80;font-size:13px;margin-top:16px;">
      Programa: <strong style="color:#fff;">${programName}</strong><br>
      Intento: ${retryAttempt}
    </p>
    <p style="color:#ffffff60;font-size:12px;margin-top:24px;">
      Si tenés problemas con tu medio de pago, contactanos a <a href="mailto:contacto@stannumgame.com" style="color:#00FFCC;">contacto@stannumgame.com</a>.
    </p>
  `));
};

// --- 4. Pre-renewal notice (3 days before) ---
const sendPreRenewalEmail = (email, programName, priceARS, renewalDate) => {
  enqueueEmail(email, `Próxima renovación — ${programName}`, wrap(`
    <h1 style="color:#fff;font-size:24px;margin:0 0 16px;">Aviso de renovación</h1>
    <p style="color:#ffffffb3;font-size:14px;line-height:1.6;">
      Tu suscripción a <strong style="color:#fff;">${programName}</strong> se renovará automáticamente el <strong style="color:#fff;">${formatDate(renewalDate)}</strong>.
    </p>
    <table style="margin:24px 0;width:100%;background:#1f1f1f;border-radius:8px;">
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Monto</td><td style="padding:16px 20px;color:#fff;font-size:13px;text-align:right;font-weight:600;">${formatARS(priceARS)}</td></tr>
      <tr><td style="padding:0 20px;"><hr style="border:none;border-top:1px solid #ffffff10;"></td><td></td></tr>
      <tr><td style="padding:16px 20px;color:#ffffff80;font-size:13px;">Fecha de cobro</td><td style="padding:16px 20px;color:#fff;font-size:13px;text-align:right;font-weight:600;">${formatDate(renewalDate)}</td></tr>
    </table>
    <p style="color:#ffffff60;font-size:12px;">
      Si no deseás continuar, podés cancelar desde <a href="${process.env.FRONTEND_URL}/dashboard/subscriptions" style="color:#00FFCC;">Mis Suscripciones</a> antes de esa fecha.
    </p>
  `));
};

// --- 5. Cancellation confirmation ---
const sendCancellationConfirmEmail = (email, programName, accessUntil) => {
  enqueueEmail(email, `Suscripción cancelada — ${programName}`, wrap(`
    <h1 style="color:#fff;font-size:24px;margin:0 0 16px;">Suscripción cancelada</h1>
    <p style="color:#ffffffb3;font-size:14px;line-height:1.6;">
      Tu suscripción a <strong style="color:#fff;">${programName}</strong> fue cancelada.
      Tu acceso al contenido se mantiene hasta el <strong style="color:#fff;">${formatDate(accessUntil)}</strong>.
    </p>
    <p style="color:#ffffff80;font-size:13px;margin-top:16px;">
      No se realizarán más cobros. Tu progreso, logros y Tins se mantienen en tu cuenta.
    </p>
    <p style="color:#ffffff60;font-size:12px;margin-top:24px;">
      Si querés volver a suscribirte, podés hacerlo en cualquier momento desde la tienda.
    </p>
  `));
};

// --- 6. Subscription expired ---
const sendSubscriptionExpiredEmail = (email, programName) => {
  enqueueEmail(email, `Suscripción expirada — ${programName}`, wrap(`
    <h1 style="color:#fff;font-size:24px;margin:0 0 16px;">Tu suscripción expiró</h1>
    <p style="color:#ffffffb3;font-size:14px;line-height:1.6;">
      Tu período de acceso a <strong style="color:#fff;">${programName}</strong> finalizó.
      Ya no podés acceder al contenido del programa.
    </p>
    <p style="color:#ffffff80;font-size:13px;margin-top:16px;">
      Tu progreso, logros y Tins siguen guardados en tu cuenta. Si te volvés a suscribir, recuperás todo.
    </p>
    <a href="${process.env.FRONTEND_URL}/dashboard/store" style="display:inline-block;background:#00FFCC;color:#000;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;margin-top:16px;">Volver a suscribirme</a>
  `));
};

// --- Pre-renewal cron (call daily) ---
const sendPreRenewalNotifications = async () => {
  try {
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    const pricing = require("../config/programPricing");
    const subscriptionProgramIds = Object.keys(pricing).filter(k => pricing[k].type === "subscription");

    // Build $or query for all subscription programs
    const orConditions = subscriptionProgramIds.map(pid => ({
      [`programs.${pid}.subscription.status`]: "active",
      [`programs.${pid}.subscription.currentPeriodEnd`]: { $gte: twoDaysFromNow, $lte: fourDaysFromNow },
    }));

    if (orConditions.length === 0) return;

    const users = await User.find({ $or: orConditions }).select("email programs").lean();
    let emailsSent = 0;

    for (const user of users) {
      for (const pid of subscriptionProgramIds) {
        const prog = user.programs?.[pid];
        if (!prog?.subscription || prog.subscription.status !== "active") continue;

        const periodEnd = prog.subscription.currentPeriodEnd;
        if (!periodEnd) continue;

        const endDate = new Date(periodEnd);
        if (endDate >= twoDaysFromNow && endDate <= fourDaysFromNow) {
          const programName = pricing[pid]?.name || pid;
          const priceARS = prog.subscription.priceARS || pricing[pid]?.currentMonthlyPriceARS || 0;
          sendPreRenewalEmail(user.email, programName, priceARS, periodEnd);
          emailsSent++;
        }
      }
    }

    console.info(`[PreRenewalCron] Queued ${emailsSent} pre-renewal emails`);
  } catch (err) {
    console.error("[PreRenewalCron] Error:", err.message);
  }
};

// --- Retry failed emails from DB (cron) ---
const MAX_EMAIL_RETRIES = 5;

const retryFailedEmails = async () => {
  try {
    const failed = await FailedEmail.find({
      resolved: false,
      retries: { $lt: MAX_EMAIL_RETRIES },
    }).limit(20);

    if (failed.length === 0) return 0;

    let retried = 0;
    for (const email of failed) {
      try {
        // Regenerate PDF attachment if receiptData is stored
        let attachments = [];
        if (email.receiptData) {
          try {
            const { generateReceiptPDF } = require("./receiptService");
            const buffer = await generateReceiptPDF(email.receiptData);
            attachments = [{
              filename: `${email.receiptData.receiptNumber || "comprobante"}.pdf`,
              content: buffer,
              contentType: "application/pdf",
            }];
          } catch (pdfErr) {
            console.warn(`[SubscriptionEmail] Failed to regenerate PDF for retry: ${pdfErr.message}`);
          }
        }

        await smtpTransporter.sendMail({
          from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
          to: email.to,
          subject: email.subject,
          html: email.html,
          ...(attachments.length > 0 && { attachments }),
        });
        email.resolved = true;
        await email.save();
        retried++;
        console.info(`[SubscriptionEmail] Retry succeeded for ${email.to}: ${email.subject}`);
      } catch (err) {
        email.retries += 1;
        email.lastError = err.message;
        await email.save();
        if (email.retries >= MAX_EMAIL_RETRIES) {
          console.error(`[SubscriptionEmail] Permanently failed after ${MAX_EMAIL_RETRIES} retries: ${email.to} — ${email.subject}`);
        }
      }

      // Rate limit between retries
      if (failed.indexOf(email) < failed.length - 1) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    }

    if (retried > 0) console.info(`[SubscriptionEmail] Retried ${retried}/${failed.length} failed emails`);
    return retried;
  } catch (err) {
    console.error('[SubscriptionEmail] Error retrying failed emails:', err.message);
    return 0;
  }
};

module.exports = {
  sendSubscriptionActivatedEmail,
  sendPaymentSuccessEmail,
  sendPaymentRejectedEmail,
  sendPreRenewalEmail,
  sendCancellationConfirmEmail,
  sendSubscriptionExpiredEmail,
  sendPurchaseConfirmationEmail,
  sendPreRenewalNotifications,
  retryFailedEmails,
};
