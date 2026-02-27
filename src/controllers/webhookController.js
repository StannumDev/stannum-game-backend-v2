const { processPaymentNotification } = require("../services/paymentService");

const handleMercadoPagoWebhook = async (req, res) => {
  res.status(200).json({ received: true });

  try {
    const { type, data } = req.body;

    if (type !== "payment" || !data?.id) return;

    await processPaymentNotification(data.id);
  } catch (err) {
    console.error("[Webhook] Error processing MP notification:", err.message);
  }
};

module.exports = { handleMercadoPagoWebhook };
