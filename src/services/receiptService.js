const PDFDocument = require("pdfkit");
const crypto = require("crypto");
const programPricing = require("../config/programPricing");
const Order = require("../models/orderModel");
const SubscriptionPayment = require("../models/subscriptionPaymentModel");

// --- Formatting utilities ---

const formatARS = (amount) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(amount);

const formatDateTime = (date) => {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return { dateStr, timeStr };
};

// --- Receipt number ---

const generateReceiptNumber = () => {
  const bytes = crypto.randomBytes(4);
  const hex = bytes.toString("hex").toUpperCase();
  return `STAN-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
};

// --- Colors ---

const COLORS = {
  bg: "#FFFFFF",
  cardBg: "#F7F7F8",
  cardBorder: "#E8E8EC",
  text: "#1A1A1A",
  textSecondary: "#6B6B76",
  textMuted: "#9B9BA5",
  accent: "#00B894",
  accentLight: "#00FFCC",
  green: "#00B894",
  divider: "#E8E8EC",
  headerBg: "#1A1A1A",
};

// --- PDF helpers ---

const drawRoundedRect = (doc, x, y, w, h, r) => {
  doc
    .moveTo(x + r, y)
    .lineTo(x + w - r, y)
    .quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h - r)
    .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - r)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y);
};

const drawCard = (doc, x, y, w, h) => {
  drawRoundedRect(doc, x, y, w, h, 8);
  doc.fill(COLORS.cardBg);
  drawRoundedRect(doc, x, y, w, h, 8);
  doc.strokeColor(COLORS.cardBorder).lineWidth(0.5).stroke();
};

const drawRow = (doc, label, value, x, y, w, options = {}) => {
  const { valueColor = COLORS.text, valueBold = false, labelWidth = 160 } = options;
  doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.textSecondary).text(label, x, y, { width: labelWidth });
  doc.font(valueBold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(valueColor).text(value, x + labelWidth, y, { width: w - labelWidth, align: "right" });
};

// --- Main PDF generation ---

const generateReceiptPDF = ({ receiptNumber, order, user, programName }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = 595.28;
      const marginX = 50;
      const contentW = pageW - marginX * 2;
      let cursorY = 0;

      // --- White background ---
      doc.rect(0, 0, pageW, 841.89).fill(COLORS.bg);

      // --- Header band ---
      doc.rect(0, 0, pageW, 90).fill(COLORS.headerBg);

      // STANNUM text
      doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.accentLight);
      doc.text("STANNUM", marginX, 28, { continued: true });
      doc.font("Helvetica").fontSize(22).fillColor("#FFFFFF99");
      doc.text(" GAME", { continued: false });

      // Contact info in header
      doc.font("Helvetica").fontSize(8).fillColor("#FFFFFF80");
      doc.text("stannumgame.com  ·  contacto@stannumgame.com", marginX, 58);

      // --- Accent line ---
      cursorY = 90;
      doc.rect(0, cursorY, pageW, 3).fill(COLORS.accent);
      cursorY += 3;

      // --- Receipt title section ---
      cursorY += 30;

      doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.text);
      doc.text("COMPROBANTE DE PAGO", marginX, cursorY);

      // Receipt number + date (right aligned)
      const { dateStr, timeStr } = formatDateTime(order.createdAt);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.accent);
      doc.text(`N° ${receiptNumber}`, marginX, cursorY, { width: contentW, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.textSecondary);
      doc.text(`${dateStr}  ·  ${timeStr} hs`, marginX, cursorY + 16, { width: contentW, align: "right" });

      // --- Buyer card ---
      cursorY += 50;
      const buyerCardH = 70;
      drawCard(doc, marginX, cursorY, contentW, buyerCardH);

      const cardPadX = marginX + 16;
      const cardContentW = contentW - 32;
      let innerY = cursorY + 14;

      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.textMuted);
      doc.text("DATOS DEL COMPRADOR", cardPadX, innerY);
      innerY += 18;

      const buyerName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "—";
      drawRow(doc, "Nombre", buyerName, cardPadX, innerY, cardContentW);
      innerY += 16;
      drawRow(doc, "Email", user.email || "—", cardPadX, innerY, cardContentW);

      // --- Purchase detail card ---
      cursorY += buyerCardH + 16;

      // Calculate card height dynamically
      let detailRows = 5; // programa, tipo, divider, total, divider
      if (order.discountApplied > 0) detailRows += 2; // original + descuento
      detailRows += 3; // metodo, id transaccion, estado
      const detailCardH = 34 + detailRows * 18 + 20;

      drawCard(doc, marginX, cursorY, contentW, detailCardH);
      innerY = cursorY + 14;

      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.textMuted);
      doc.text("DETALLE DE LA COMPRA", cardPadX, innerY);
      innerY += 22;

      // Program name
      drawRow(doc, "Programa", programName, cardPadX, innerY, cardContentW);
      innerY += 18;

      // Purchase type
      const typeLabel = order.type === "gift" ? "Regalo" : "Compra personal";
      drawRow(doc, "Tipo", typeLabel, cardPadX, innerY, cardContentW);
      innerY += 18;

      // Divider
      doc.strokeColor(COLORS.divider).lineWidth(0.5)
        .moveTo(cardPadX, innerY).lineTo(cardPadX + cardContentW, innerY).stroke();
      innerY += 12;

      // Pricing
      if (order.discountApplied > 0) {
        drawRow(doc, "Precio original", formatARS(order.originalAmount), cardPadX, innerY, cardContentW);
        innerY += 18;

        // Coupon discount
        const discountLabel = order.couponCode ? `Descuento (${order.couponCode})` : "Descuento";
        drawRow(doc, discountLabel, `-${formatARS(order.discountApplied)}`, cardPadX, innerY, cardContentW, { valueColor: COLORS.green });
        innerY += 18;

        // Divider before total
        doc.strokeColor(COLORS.divider).lineWidth(0.5)
          .moveTo(cardPadX, innerY).lineTo(cardPadX + cardContentW, innerY).stroke();
        innerY += 12;
      }

      // Total
      drawRow(doc, "TOTAL", formatARS(order.finalAmount), cardPadX, innerY, cardContentW, {
        valueColor: COLORS.accent,
        valueBold: true,
      });
      innerY += 18;

      // Divider
      doc.strokeColor(COLORS.divider).lineWidth(0.5)
        .moveTo(cardPadX, innerY).lineTo(cardPadX + cardContentW, innerY).stroke();
      innerY += 12;

      // Payment method
      drawRow(doc, "Método de pago", "Mercado Pago", cardPadX, innerY, cardContentW);
      innerY += 18;

      // MP Payment ID
      const paymentId = order.mpPaymentId || "—";
      drawRow(doc, "ID transacción", paymentId, cardPadX, innerY, cardContentW);
      innerY += 18;

      // Status
      const statusText = "Aprobado";
      doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.textSecondary).text("Estado", cardPadX, innerY, { width: 160 });
      // Green dot + text
      doc.circle(cardPadX + 160 + contentW - 32 - 160 - 8, innerY + 5, 3).fill(COLORS.green);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLORS.green);
      doc.text(statusText, cardPadX + 160, innerY, { width: cardContentW - 160, align: "right" });

      // --- Legal note ---
      cursorY += detailCardH + 24;
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLORS.textMuted);
      doc.text(
        "Este comprobante no constituye factura fiscal. Si necesitás factura, solicitala a contacto@stannumgame.com indicando tus datos fiscales (CUIT y condición frente al IVA).",
        marginX,
        cursorY,
        { width: contentW, lineGap: 2 }
      );

      // --- Footer ---
      // Dynamic position: at least 40px below legal note, but never above 780
      const footerY = Math.max(cursorY + 40, 780);
      doc.strokeColor(COLORS.divider).lineWidth(0.5)
        .moveTo(marginX, footerY).lineTo(marginX + contentW, footerY).stroke();

      doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.textMuted);
      doc.text("STANNUM Game  ·  stannumgame.com  ·  Buenos Aires, Argentina", marginX, footerY + 8, {
        width: contentW,
        align: "center",
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// --- Atomic receipt number assignment with retry ---

const MAX_RECEIPT_RETRIES = 5;

const assignReceiptNumber = async (Model, docId, currentReceiptNumber) => {
  if (currentReceiptNumber) return currentReceiptNumber;

  for (let attempt = 0; attempt < MAX_RECEIPT_RETRIES; attempt++) {
    const candidate = generateReceiptNumber();
    try {
      const updated = await Model.findOneAndUpdate(
        { _id: docId, receiptNumber: null },
        { $set: { receiptNumber: candidate } },
        { new: true }
      );
      if (!updated) {
        // Another concurrent call already set it — re-read and return
        const existing = await Model.findById(docId).select("receiptNumber");
        return existing.receiptNumber;
      }
      return candidate;
    } catch (err) {
      if (err.code === 11000 && err.message?.includes("receiptNumber")) continue;
      throw err;
    }
  }
  throw new Error("Failed to generate unique receipt number");
};

// --- Orchestrator ---

const generateOrderReceipt = async (order, user) => {
  const programConfig = programPricing[order.programId];
  const programName = programConfig?.name || order.programId;

  // Atomic receipt number assignment with collision retry
  const receiptNumber = await assignReceiptNumber(Order, order._id, order.receiptNumber);
  order.receiptNumber = receiptNumber;

  // Populate coupon code if couponId exists
  let couponCode = null;
  if (order.couponId) {
    try {
      const populated = await order.populate("couponId");
      couponCode = populated.couponId?.code || null;
    } catch {
      // Non-critical
    }
  }

  const buffer = await generateReceiptPDF({
    receiptNumber,
    order: { ...order.toObject(), couponCode },
    user,
    programName,
  });

  return { buffer, receiptNumber };
};

// --- Subscription receipt ---

const generateSubscriptionReceipt = async (payment, user, programId) => {
  const programConfig = programPricing[programId];
  const programName = programConfig?.name || programId;

  // Atomic receipt number assignment with collision retry
  const receiptNumber = await assignReceiptNumber(SubscriptionPayment, payment._id, payment.receiptNumber);
  payment.receiptNumber = receiptNumber;

  const orderLike = {
    createdAt: payment.createdAt,
    programId,
    type: "self",
    originalAmount: payment.amount,
    finalAmount: payment.amount,
    discountApplied: 0,
    currency: payment.currency || "ARS",
    mpPaymentId: payment.mpPaymentId,
    status: payment.status,
  };

  const buffer = await generateReceiptPDF({
    receiptNumber,
    order: orderLike,
    user,
    programName: `${programName} — Suscripción mensual`,
  });

  return { buffer, receiptNumber };
};

module.exports = {
  generateReceiptNumber,
  generateReceiptPDF,
  generateOrderReceipt,
  generateSubscriptionReceipt,
};
