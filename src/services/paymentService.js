const axios = require("axios");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");

const Order = require("../models/orderModel");
const Coupon = require("../models/couponModel");
const ProductKey = require("../models/productKeyModel");
const User = require("../models/userModel");
const { activateProgramForUser } = require("./programActivationService");
const { generateOrderReceipt } = require("./receiptService");
const { sendPurchaseConfirmationEmail } = require("./subscriptionEmailService");
const programPricing = require("../config/programPricing");

const MP_API = "https://api.mercadopago.com";

const getMP = (path) =>
  axios.get(`${MP_API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    timeout: 10000,
  });

// Fix #24: singleton transporter
const smtpTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Fix #14: crypto-secure product key generation
const generateProductCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segment = () =>
    Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
};

const MAX_KEY_RETRIES = 5;

const createProductKeysForOrder = async (order, buyerEmail) => {
  const keys = [];
  const quantity = order.keysQuantity || 1;

  for (let i = 0; i < quantity; i++) {
    let code;
    for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
      const candidate = generateProductCode();
      try {
        const pk = await ProductKey.create({
          code: candidate,
          email: buyerEmail,
          product: order.programId,
          team: "no_team",
        });
        code = candidate;
        keys.push(pk._id);
        break;
      } catch (err) {
        if (err.code === 11000) continue;
        throw err;
      }
    }
    if (!code) throw new Error("Failed to generate unique product key");
  }

  return keys;
};

const sendGiftEmail = async (order, productKeys) => {
  const pricing = programPricing[order.programId];
  const programName = pricing?.name || order.programId;

  const pkDocs = await ProductKey.find({ _id: { $in: productKeys } });
  const codes = pkDocs.map((pk) => pk.code);

  const codesHtml = codes
    .map(
      (code) =>
        `<div style="background: linear-gradient(135deg, #00FFCC 0%, #00A896 100%); padding: 15px; border-radius: 8px; display: inline-block; margin: 8px 0; box-shadow: 0 4px 15px rgba(0, 255, 204, 0.3);">
          <span style="color: #1f1f1f; font-size: 28px; letter-spacing: 3px; font-weight: 900; text-shadow: 1px 1px 3px rgba(0,0,0,0.2);">${code}</span>
        </div>`
    )
    .join("<br/>");

  const mailOptions = {
    from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
    to: order.giftEmail,
    subject: `¡Te regalaron ${programName} en STANNUM Game!`,
    html: `
      <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 30px; border-radius: 12px; max-width: 700px; margin: auto;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00FFCC; font-size: 32px; font-weight: 700; margin: 0;">¡Te regalaron un programa!</h1>
        </div>
        <div style="background-color: #2a2a2a; padding: 25px; border-radius: 10px; margin-bottom: 30px; border-left: 4px solid #00FFCC;">
          <h2 style="color: #00FFCC; font-size: 20px; margin: 0 0 15px 0; font-weight: 600;">${programName}</h2>
          <p style="font-size: 16px; color: #e0e0e0; line-height: 1.8; margin: 0;">
            Alguien te regaló acceso a este programa en STANNUM Game. Usá la siguiente clave para activarlo:
          </p>
        </div>
        <div style="text-align: center; margin: 40px 0;">
          <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 15px; font-weight: 600;">${codes.length > 1 ? "Tus Claves de Acceso" : "Tu Clave de Acceso"}</h2>
          ${codesHtml}
          <br/><br/>
          <a href="https://stannumgame.com" style="display: inline-block; background-color: #00FFCC; color: #1f1f1f; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; margin-top: 10px;">Activar Clave Ahora</a>
        </div>
        <hr style="border: none; border-top: 1px solid #515151; margin: 40px 0;" />
        <div style="text-align: center;">
          <p style="font-size: 14px; color: #888; line-height: 1.6; margin-bottom: 10px;">¿No esperabas este correo? Podés ignorarlo.</p>
          <p style="font-size: 14px; color: #aaa; margin-top: 20px;">Nos vemos en el campo de juego,<br /> <span style="color: #00FFCC; font-weight: 600;">Equipo STANNUM</span></p>
          <footer style="margin-top: 40px; font-size: 12px; color: #515151;">&copy; 2026 STANNUM Game. Todos los derechos reservados.</footer>
        </div>
      </div>
    `,
  };

  await smtpTransporter.sendMail(mailOptions);
};

// Fix #4: idempotent fulfillOrder with atomic claim
const fulfillOrder = async (order) => {
  // Atomic claim: only one caller can fulfill
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, fulfilledAt: null },
    { $set: { fulfilledAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    console.log(`[Payment] Order ${order._id} already fulfilled, skipping`);
    return;
  }

  try {
    // Coupon usage already incremented atomically in claimCoupon (createPreference).
    // Mark couponCounted for reconciliation consistency.
    if (claimed.couponId && !claimed.couponCounted) {
      claimed.couponCounted = true;
      await claimed.save();
    }

    const user = await User.findById(claimed.userId);
    if (!user) {
      console.error(`[Payment] User not found for order ${claimed._id}`);
      await Order.updateOne({ _id: claimed._id }, { $set: { fulfilledAt: null } });
      return;
    }

    if (claimed.type === "self") {
      await activateProgramForUser(claimed.userId, claimed.programId, "no_team");
    } else if (claimed.type === "gift") {
      // HIGH-04 fix: Save keys to DB immediately after creation to prevent orphans.
      // If this save succeeds but email fails, retries will find the keys linked.
      if (!claimed.productKeys || claimed.productKeys.length === 0) {
        const keyIds = await createProductKeysForOrder(claimed, user.email);
        claimed.productKeys = keyIds;
        await claimed.save(); // Persist keys immediately
      }

      if (claimed.giftDelivery === "email" && claimed.giftEmail) {
        try {
          await sendGiftEmail(claimed, claimed.productKeys);
          claimed.giftEmailSent = true;
        } catch (err) {
          console.error(`[Payment] Failed to send gift email for order ${claimed._id}:`, err.message);
          claimed.giftEmailSent = false;
          claimed.giftEmailRetries = (claimed.giftEmailRetries || 0) + 1;
        }
      }
    }

    await claimed.save();

    // Generate receipt PDF and send confirmation email (non-blocking)
    try {
      const { buffer, receiptNumber } = await generateOrderReceipt(claimed, user);
      const pName = programPricing[claimed.programId]?.name || claimed.programId;
      const pdfAttachment = {
        filename: `${receiptNumber}.pdf`,
        content: buffer,
        contentType: "application/pdf",
      };
      const receiptData = {
        receiptNumber,
        order: { createdAt: claimed.createdAt, programId: claimed.programId, type: claimed.type, originalAmount: claimed.originalAmount, finalAmount: claimed.finalAmount, discountApplied: claimed.discountApplied, currency: claimed.currency, mpPaymentId: claimed.mpPaymentId, status: claimed.status },
        user: { firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.email },
        programName: pName,
      };
      sendPurchaseConfirmationEmail(user.email, pName, claimed, pdfAttachment, receiptData);
    } catch (receiptErr) {
      console.error(`[Payment] Receipt generation failed for order ${claimed._id}:`, receiptErr.message);
    }
  } catch (err) {
    // Rollback fulfilledAt so reconciliation can retry
    await Order.updateOne({ _id: claimed._id }, { $set: { fulfilledAt: null } }).catch(() => {});
    throw err;
  }
};

// Fix #8: binary_mode=true → only approved/rejected for credit cards
// Fix #13: optional expectedUserId to prevent cross-user fulfillment via verifyPayment
const processPaymentNotification = async (paymentId, expectedUserId = null) => {
  const { data: payment } = await getMP(`/v1/payments/${paymentId}`);

  const orderId = payment.external_reference;
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    console.error(`[Payment] Invalid external_reference in payment ${paymentId}: ${orderId}`);
    return null;
  }

  // If called from verifyPayment, check ownership before processing
  if (expectedUserId) {
    const check = await Order.findById(orderId);
    if (!check || check.userId.toString() !== expectedUserId) return null;
  }

  // binary_mode=true: approved or rejected. Map other edge cases appropriately.
  let mpStatus;
  if (payment.status === "approved") {
    mpStatus = "approved";
  } else if (["refunded"].includes(payment.status)) {
    mpStatus = "refunded";
  } else if (["charged_back"].includes(payment.status)) {
    mpStatus = "chargedback";
  } else {
    mpStatus = "rejected";
  }

  // Handle post-approval transitions (refunded/chargedback) on already-approved orders
  if (["refunded", "chargedback"].includes(mpStatus)) {
    await Order.findOneAndUpdate(
      { _id: orderId, status: "approved" },
      { status: mpStatus, mpPaymentId: String(paymentId) }
    );
    const existing = await Order.findById(orderId);
    return existing;
  }

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending" },
    { status: mpStatus, mpPaymentId: String(paymentId) },
    { new: true }
  );

  if (!updated) {
    const existing = await Order.findById(orderId);
    return existing;
  }

  if (mpStatus === "approved") {
    try {
      await fulfillOrder(updated);
    } catch (err) {
      console.error(`[Payment] Fulfillment failed for order ${updated._id}:`, err.message);
    }
  }

  return updated;
};

// Fix #23: concurrency guard for reconciliation
let isReconciling = false;

const reconcilePayments = async () => {
  if (isReconciling) {
    console.log("[Reconciliation] Already running, skipping");
    return;
  }
  isReconciling = true;

  const now = new Date();
  console.log(`[Reconciliation] Running at ${now.toISOString()}`);

  try { // outer try/finally to always reset isReconciling
  try {
    const expired = await Order.updateMany(
      { status: "pending", expiresAt: { $lte: now } },
      { status: "expired" }
    );
    if (expired.modifiedCount > 0) {
      console.log(`[Reconciliation] Expired ${expired.modifiedCount} orders`);
    }
  } catch (err) {
    console.error("[Reconciliation] Error expiring orders:", err.message);
  }

  try {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const stalePending = await Order.find({
      status: "pending",
      createdAt: { $lte: fiveMinAgo },
      expiresAt: { $gt: now },
      mpPreferenceId: { $ne: null },
    });

    for (const order of stalePending) {
      try {
        const { data: searchResult } = await axios.get(
          `${MP_API}/v1/payments/search`,
          {
            params: { external_reference: order._id.toString(), sort: "date_created", criteria: "desc" },
            headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
            timeout: 10000,
          }
        );

        if (searchResult.results?.length > 0) {
          const payment = searchResult.results[0];
          if (payment.status === "approved") {
            await processPaymentNotification(payment.id);
          }
        }
      } catch (err) {
        console.error(`[Reconciliation] Error checking order ${order._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Reconciliation] Error checking stale pending orders:", err.message);
  }

  try {
    const unfulfilled = await Order.find({
      status: "approved",
      fulfilledAt: null,
    });

    for (const order of unfulfilled) {
      try {
        console.log(`[Reconciliation] Retrying fulfillment for order ${order._id}`);
        await fulfillOrder(order);
      } catch (err) {
        console.error(`[Reconciliation] Fulfillment retry failed for order ${order._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Reconciliation] Error retrying unfulfilled orders:", err.message);
  }

  try {
    const MAX_GIFT_EMAIL_RETRIES = 5;
    const failedEmails = await Order.find({
      status: "approved",
      type: "gift",
      giftDelivery: "email",
      giftEmailSent: false,
      fulfilledAt: { $ne: null },
      productKeys: { $not: { $size: 0 } },
      $or: [
        { giftEmailRetries: { $exists: false } },
        { giftEmailRetries: { $lt: MAX_GIFT_EMAIL_RETRIES } },
      ],
    });

    for (const order of failedEmails) {
      try {
        await sendGiftEmail(order, order.productKeys);
        order.giftEmailSent = true;
        await order.save();
        console.log(`[Reconciliation] Resent gift email for order ${order._id}`);
      } catch (err) {
        order.giftEmailRetries = (order.giftEmailRetries || 0) + 1;
        await order.save().catch(() => {});
        if (order.giftEmailRetries >= MAX_GIFT_EMAIL_RETRIES) {
          console.error(`[Reconciliation] Gift email permanently failed for order ${order._id} after ${MAX_GIFT_EMAIL_RETRIES} retries`);
        } else {
          console.error(`[Reconciliation] Email retry ${order.giftEmailRetries}/${MAX_GIFT_EMAIL_RETRIES} failed for order ${order._id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("[Reconciliation] Error retrying gift emails:", err.message);
  }

  } finally {
    isReconciling = false;
  }
};

module.exports = {
  processPaymentNotification,
  fulfillOrder,
  createProductKeysForOrder,
  sendGiftEmail,
  reconcilePayments,
  getMP,
};
