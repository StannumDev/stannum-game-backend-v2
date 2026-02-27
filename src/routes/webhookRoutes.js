const { Router } = require("express");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { verifyMPWebhook } = require("../middlewares/webhookVerify");
const { handleMercadoPagoWebhook } = require("../controllers/webhookController");

const router = Router();

router.use(express.json({ limit: "1mb" }));

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/mercadopago", webhookLimiter, verifyMPWebhook, handleMercadoPagoWebhook);

module.exports = router;
