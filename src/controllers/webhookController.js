const { processPaymentNotification } = require("../services/paymentService");
const {
  processPreapprovalWebhook,
  processAuthorizedPaymentWebhook,
} = require("../services/subscriptionService");

const handleMercadoPagoWebhook = async (req, res) => {
  // HIGH-06 fix: Validate data.id from body matches the query param used in HMAC verification
  const queryDataId = req.query["data.id"];
  const bodyDataId = req.body?.data?.id;

  if (queryDataId && bodyDataId && String(queryDataId) !== String(bodyDataId)) {
    console.error("[Webhook] data.id mismatch: query=", queryDataId, "body=", bodyDataId);
    return res.status(400).json({ error: "data.id mismatch" });
  }

  // CRIT-03 fix: Process webhook THEN respond 200 (not fire-and-forget).
  // MP retries on non-2xx, so processing first ensures idempotent handling.
  try {
    const { type, data } = req.body;

    if (!data?.id) {
      return res.status(200).json({ received: true });
    }

    if (type === "payment") {
      await processPaymentNotification(data.id);
    } else if (type === "subscription_preapproval") {
      await processPreapprovalWebhook(data.id);
    } else if (type === "subscription_authorized_payment") {
      await processAuthorizedPaymentWebhook(data.id);
    } else if (type === "subscription_preapproval_plan") {
      console.info("[Webhook] subscription_preapproval_plan received, ignoring:", data.id);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[Webhook] Error processing MP notification:", err.message);
    // Non-retryable business logic errors (already processed, invalid state, etc.) → 200
    if (err.retryable === false) {
      return res.status(200).json({ received: true });
    }
    // All other errors (DB, network, unexpected) → 500 so MP retries
    return res.status(500).json({ error: "processing_failed" });
  }
};

module.exports = { handleMercadoPagoWebhook };
