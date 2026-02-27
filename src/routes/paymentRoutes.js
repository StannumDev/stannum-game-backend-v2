const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { isAdmin } = require("../middlewares/isAdmin");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { paymentLimiter } = require("../middlewares/rateLimiter");
const paymentController = require("../controllers/paymentController");

const router = Router();

router.post(
  "/create-preference",
  [
    validateJWT,
    paymentLimiter,
    check("programId", "El programa es obligatorio.").trim().notEmpty(),
    check("type", "El tipo de compra es obligatorio.").trim().isIn(["self", "gift"]),
    fieldsValidate,
  ],
  paymentController.createPreference
);

router.post(
  "/verify",
  [validateJWT],
  paymentController.verifyPayment
);

router.get(
  "/order/:orderId",
  [validateJWT],
  paymentController.getOrder
);

router.get(
  "/my-orders",
  [validateJWT],
  paymentController.getMyOrders
);

router.post(
  "/order/:orderId/cancel",
  [validateJWT],
  paymentController.cancelOrder
);

router.post(
  "/order/:orderId/resend-email",
  [validateJWT],
  paymentController.resendGiftEmail
);

router.post(
  "/apply-coupon",
  [
    validateJWT,
    check("programId", "El programa es obligatorio.").trim().notEmpty(),
    check("couponCode", "El código de cupón es obligatorio.").trim().notEmpty(),
    fieldsValidate,
  ],
  paymentController.applyCoupon
);

router.post(
  "/coupon",
  [
    validateJWT,
    isAdmin,
    check("code", "El código es obligatorio.").trim().notEmpty(),
    check("discountType", "El tipo de descuento es obligatorio.").isIn(["percentage", "fixed"]),
    check("discountValue", "El valor del descuento es obligatorio.").isFloat({ min: 0 }),
    check("validFrom", "La fecha de inicio es obligatoria.").isISO8601(),
    check("validUntil", "La fecha de vencimiento es obligatoria.").isISO8601(),
    fieldsValidate,
  ],
  paymentController.createCoupon
);

router.get(
  "/coupons",
  [validateJWT, isAdmin],
  paymentController.getCoupons
);

router.put(
  "/coupon/:id",
  [validateJWT, isAdmin],
  paymentController.updateCoupon
);

module.exports = router;
