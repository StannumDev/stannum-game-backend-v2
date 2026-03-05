const axios = require("axios");

const Order = require("../models/orderModel");
const Coupon = require("../models/couponModel");
const User = require("../models/userModel");
const ProductKey = require("../models/productKeyModel");
const { getError } = require("../helpers/getError");
const { activateProgramForUser } = require("../services/programActivationService");
const { processPaymentNotification, fulfillOrder, createProductKeysForOrder, sendGiftEmail } = require("../services/paymentService");
const programPricing = require("../config/programPricing");

const MP_API = "https://api.mercadopago.com";

const validateCoupon = async (couponCode, programId, originalAmount, userId) => {
  const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
  if (!coupon) throw { statusCode: 404, errorKey: "PAYMENT_COUPON_NOT_FOUND" };

  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validUntil) {
    throw { statusCode: 400, errorKey: "PAYMENT_COUPON_EXPIRED" };
  }

  if (coupon.applicablePrograms.length > 0 && !coupon.applicablePrograms.includes(programId)) {
    throw { statusCode: 400, errorKey: "PAYMENT_COUPON_NOT_APPLICABLE" };
  }

  if (originalAmount < coupon.minAmount) {
    throw { statusCode: 400, errorKey: "PAYMENT_COUPON_MIN_AMOUNT" };
  }

  // Atomic coupon usage: increment currentUses only if under maxUses
  if (coupon.maxUses !== null) {
    const updated = await Coupon.findOneAndUpdate(
      { _id: coupon._id, currentUses: { $lt: coupon.maxUses } },
      { $inc: { currentUses: 1 } },
      { new: true }
    );
    if (!updated) {
      throw { statusCode: 400, errorKey: "PAYMENT_COUPON_MAX_USES" };
    }
  }

  const userUsageCount = await Order.countDocuments({
    userId,
    couponId: coupon._id,
    status: { $in: ["approved", "pending"] },
  });
  if (userUsageCount >= coupon.maxUsesPerUser) {
    throw { statusCode: 400, errorKey: "PAYMENT_COUPON_MAX_USES_PER_USER" };
  }

  let discountApplied;
  if (coupon.discountType === "percentage") {
    discountApplied = Math.round(originalAmount * (coupon.discountValue / 100));
  } else {
    discountApplied = Math.min(coupon.discountValue, originalAmount);
  }

  const finalAmount = Math.max(0, originalAmount - discountApplied);

  return { coupon, discountApplied, finalAmount };
};

const createPreference = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { programId, type = "self", giftDelivery, giftEmail, couponCode } = req.body;

    const pricing = programPricing[programId];
    if (!pricing || pricing.type !== 'purchase') return res.status(400).json(getError("PAYMENT_INVALID_PROGRAM"));
    if (!pricing.purchasable || pricing.priceARS <= 0) {
      return res.status(400).json(getError("PAYMENT_PROGRAM_NOT_PURCHASABLE"));
    }

    if (type === "self") {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
      const { hasAccess } = require("../utils/accessControl");
      if (hasAccess(user.programs?.[programId])) {
        return res.status(400).json(getError("PAYMENT_PROGRAM_ALREADY_OWNED"));
      }
    }

    if (type === "gift") {
      if (!giftDelivery || !["email", "manual"].includes(giftDelivery)) {
        return res.status(400).json(getError("VALIDATION_GENERIC_ERROR", { friendlyMessage: "Seleccioná cómo querés entregar el regalo." }));
      }
      if (giftDelivery === "email" && !giftEmail) {
        return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
      }
    }

    const existingPending = await Order.findOne({ userId, programId, status: "pending" });
    if (existingPending) {
      if (existingPending.expiresAt && existingPending.expiresAt <= new Date()) {
        existingPending.status = "expired";
        await existingPending.save();
      } else if (existingPending.mpPreferenceId) {
        return res.status(200).json({
          success: true,
          orderId: existingPending._id,
          preferenceId: existingPending.mpPreferenceId,
          initPoint: existingPending.mpInitPoint,
          status: "pending",
        });
      } else {
        existingPending.status = "cancelled";
        await existingPending.save();
      }
    }

    const originalAmount = pricing.priceARS;
    let finalAmount = originalAmount;
    let discountApplied = 0;
    let couponId = null;

    if (couponCode) {
      const couponResult = await validateCoupon(couponCode, programId, originalAmount, userId);
      finalAmount = couponResult.finalAmount;
      discountApplied = couponResult.discountApplied;
      couponId = couponResult.coupon._id;
    }

    const keysQuantity = type === "gift" ? (pricing.keysQuantity || 1) : 1;

    if (finalAmount === 0) {
      const order = await Order.create({
        userId,
        programId,
        type,
        giftDelivery: type === "gift" ? giftDelivery : null,
        giftEmail: type === "gift" && giftDelivery === "email" ? giftEmail : null,
        keysQuantity,
        couponId,
        discountApplied,
        originalAmount,
        finalAmount: 0,
        status: "approved",
      });

      await fulfillOrder(order);

      return res.status(200).json({
        success: true,
        orderId: order._id,
        status: "approved",
        directActivation: true,
      });
    }

    const order = await Order.create({
      userId,
      programId,
      type,
      giftDelivery: type === "gift" ? giftDelivery : null,
      giftEmail: type === "gift" && giftDelivery === "email" ? giftEmail : null,
      keysQuantity,
      couponId,
      discountApplied,
      originalAmount,
      finalAmount,
      status: "pending",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const frontendUrl = process.env.FRONTEND_URL || "https://stannumgame.com";

    const preferenceBody = {
      items: [
        {
          id: programId,
          title: pricing.name,
          unit_price: finalAmount,
          quantity: 1,
          currency_id: "ARS",
        },
      ],
      external_reference: order._id.toString(),
      back_urls: {
        success: `${frontendUrl}/dashboard/checkout/result`,
        failure: `${frontendUrl}/dashboard/checkout/result`,
        pending: `${frontendUrl}/dashboard/checkout/result`,
      },
      ...(frontendUrl.startsWith("https") ? { auto_return: "approved" } : {}),
      notification_url: process.env.MP_NOTIFICATION_URL,
      binary_mode: true,
      expires: true,
      expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      metadata: {
        user_id: userId,
        program_id: programId,
        order_id: order._id.toString(),
        type,
      },
    };

    const { data: preference } = await axios.post(
      `${MP_API}/checkout/preferences`,
      preferenceBody,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    order.mpPreferenceId = preference.id;
    order.mpInitPoint = preference.init_point;
    await order.save();

    return res.status(200).json({
      success: true,
      orderId: order._id,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      status: "pending",
    });
  } catch (error) {
    if (error.statusCode && error.errorKey) {
      return res.status(error.statusCode).json(getError(error.errorKey));
    }
    console.error("[Payment] Error creating preference:", error.message, error.response?.data);
    return res.status(500).json(getError("PAYMENT_PREFERENCE_FAILED"));
  }
};

const verifyPayment = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { paymentId, orderId } = req.body;

    if (orderId) {
      const order = await Order.findOne({ _id: orderId, userId });
      if (!order) return res.status(404).json(getError("PAYMENT_ORDER_NOT_FOUND"));

      if (order.status !== "pending") {
        await order.populate("productKeys");
        return res.status(200).json({ success: true, order: order.getOrderDetails() });
      }
    }

    if (!paymentId) {
      if (orderId) {
        const order = await Order.findOne({ _id: orderId, userId });
        return res.status(200).json({ success: true, order: order?.getOrderDetails() || null });
      }
      return res.status(400).json(getError("VALIDATION_GENERIC_ERROR", { friendlyMessage: "Se requiere paymentId o orderId." }));
    }

    const existingOrder = await Order.findOne({ mpPaymentId: String(paymentId) });
    if (existingOrder) {
      if (existingOrder.userId.toString() !== userId) {
        return res.status(404).json(getError("PAYMENT_ORDER_NOT_FOUND"));
      }
      await existingOrder.populate("productKeys");
      return res.status(200).json({ success: true, order: existingOrder.getOrderDetails() });
    }

    // Fix #13: pass userId so processPaymentNotification checks ownership before fulfilling
    const updated = await processPaymentNotification(paymentId, userId);
    if (!updated) return res.status(404).json(getError("PAYMENT_ORDER_NOT_FOUND"));

    if (updated.userId.toString() !== userId) {
      return res.status(404).json(getError("PAYMENT_ORDER_NOT_FOUND"));
    }

    await updated.populate("productKeys");
    return res.status(200).json({ success: true, order: updated.getOrderDetails() });
  } catch (error) {
    console.error("[Payment] Error verifying payment:", error.message);
    return res.status(500).json(getError("PAYMENT_VERIFICATION_FAILED"));
  }
};

const getOrder = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) return res.status(404).json(getError("PAYMENT_ORDER_NOT_FOUND"));

    await order.populate("productKeys");
    return res.status(200).json({ success: true, order: order.getOrderDetails() });
  } catch (error) {
    console.error("[Payment] Error getting order:", error.message);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const getMyOrders = async (req, res) => {
  try {
    const userId = req.userAuth.id;

    const orders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .populate("productKeys")
      .lean();

    const mapped = orders.map((o) => ({
      id: o._id,
      programId: o.programId,
      type: o.type,
      giftDelivery: o.giftDelivery,
      giftEmail: o.giftEmail,
      keysQuantity: o.keysQuantity,
      discountApplied: o.discountApplied,
      originalAmount: o.originalAmount,
      finalAmount: o.finalAmount,
      currency: o.currency,
      status: o.status,
      productKeys: o.productKeys?.map((pk) => ({ code: pk.code, used: pk.used })) || [],
      fulfilledAt: o.fulfilledAt,
      giftEmailSent: o.giftEmailSent,
      createdAt: o.createdAt,
    }));

    return res.status(200).json({ success: true, orders: mapped });
  } catch (error) {
    console.error("[Payment] Error getting user orders:", error.message);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const cancelOrder = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { orderId } = req.params;

    const updated = await Order.findOneAndUpdate(
      { _id: orderId, userId, status: "pending" },
      { status: "cancelled" },
      { new: true }
    );

    if (!updated) return res.status(400).json(getError("PAYMENT_CANCEL_NOT_ALLOWED"));

    return res.status(200).json({ success: true, message: "Orden cancelada." });
  } catch (error) {
    console.error("[Payment] Error cancelling order:", error.message);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const resendGiftEmail = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      userId,
      status: "approved",
      type: "gift",
      giftDelivery: "email",
    });

    if (!order || order.productKeys.length === 0) {
      return res.status(400).json(getError("PAYMENT_RESEND_NOT_ALLOWED"));
    }

    await sendGiftEmail(order, order.productKeys);
    order.giftEmailSent = true;
    await order.save();

    return res.status(200).json({ success: true, message: "Correo reenviado." });
  } catch (error) {
    console.error("[Payment] Error resending gift email:", error.message);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const applyCoupon = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { programId, couponCode } = req.body;

    const pricing = programPricing[programId];
    if (!pricing) return res.status(400).json(getError("PAYMENT_INVALID_PROGRAM"));
    if (!pricing.purchasable || pricing.priceARS <= 0) {
      return res.status(400).json(getError("PAYMENT_PROGRAM_NOT_PURCHASABLE"));
    }

    const { coupon, discountApplied, finalAmount } = await validateCoupon(
      couponCode,
      programId,
      pricing.priceARS,
      userId
    );

    return res.status(200).json({
      success: true,
      valid: true,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountApplied,
      originalAmount: pricing.priceARS,
      finalAmount,
    });
  } catch (error) {
    if (error.statusCode && error.errorKey) {
      return res.status(error.statusCode).json(getError(error.errorKey));
    }
    console.error("[Payment] Error applying coupon:", error.message);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const createCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, applicablePrograms, minAmount, maxUses, maxUsesPerUser, validFrom, validUntil } = req.body;

    const coupon = await Coupon.create({
      code,
      discountType,
      discountValue,
      applicablePrograms: applicablePrograms || [],
      minAmount: minAmount || 0,
      maxUses: maxUses || null,
      maxUsesPerUser: maxUsesPerUser || 1,
      validFrom,
      validUntil,
    });

    return res.status(201).json({ success: true, coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json(getError("VALIDATION_GENERIC_ERROR", { friendlyMessage: "Ya existe un cupón con ese código." }));
    }
    console.error("[Payment] Error creating coupon:", error.message);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, coupons });
  } catch (error) {
    console.error("[Payment] Error getting coupons:", error.message);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const COUPON_ALLOWED_FIELDS = ["discountType", "discountValue", "applicablePrograms", "minAmount", "maxUses", "maxUsesPerUser", "validFrom", "validUntil", "isActive"];

const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    for (const key of COUPON_ALLOWED_FIELDS) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const coupon = await Coupon.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json(getError("PAYMENT_COUPON_NOT_FOUND"));

    return res.status(200).json({ success: true, coupon });
  } catch (error) {
    console.error("[Payment] Error updating coupon:", error.message);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = {
  createPreference,
  verifyPayment,
  getOrder,
  getMyOrders,
  cancelOrder,
  resendGiftEmail,
  applyCoupon,
  createCoupon,
  getCoupons,
  updateCoupon,
};
