const axios = require("axios");

// Notifica al Trenno Dashboard de eventos de usuario (ingreso, avance).
// Fire-and-forget: nunca lanza ni bloquea el flujo principal — Trenno tiene un
// cron de reconciliación como respaldo si un webhook se pierde.
// No-op si no está configurado (TRENNO_WEBHOOK_URL / STG_WEBHOOK_SECRET).
const notifyTrenno = (event, email, data = {}) => {
    const url = process.env.TRENNO_WEBHOOK_URL;
    const secret = process.env.STG_WEBHOOK_SECRET;
    if (!url || !secret || !email) return;

    axios
        .post(
            url,
            { event, email: String(email).toLowerCase().trim(), data },
            {
                headers: { "x-webhook-secret": secret, "Content-Type": "application/json" },
                timeout: 8000,
            }
        )
        .catch((err) => {
            console.error(`notifyTrenno(${event}) falló:`, err.response?.status || err.message);
        });
};

module.exports = { notifyTrenno };
