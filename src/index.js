const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { globalLimiter } = require("./middlewares/rateLimiter");

const authRouter = require("./routes/authRoutes");
const profilePhotoRouter = require("./routes/profilePhotoRoutes");
const userRouter = require("./routes/userRoutes");
const lessonRouter = require("./routes/lessonRoutes");
const instructionRouter = require("./routes/instructionRoutes");
const productKeyRouter = require("./routes/productKeyRoutes");
const rankingRouter = require("./routes/rankingRoutes");
const promptRouter = require("./routes/promptRoutes");
const assistantRouter = require("./routes/assistantRoutes");
const storeRouter = require("./routes/storeRoutes");
const chestRouter = require("./routes/chestRoutes");
const webhookRouter = require("./routes/webhookRoutes");
const paymentRouter = require("./routes/paymentRoutes");
const subscriptionRouter = require("./routes/subscriptionRoutes");
const cron = require("node-cron");
const { reconcilePayments } = require("./services/paymentService");
const { expireCancelledSubscriptions, retryFailedDemoTransfers } = require("./services/subscriptionService");
const { sendPreRenewalNotifications, retryFailedEmails } = require("./services/subscriptionEmailService");
const { reconcileHot, reconcileCold, checkWebhookHealth } = require("./services/subscriptionReconciliationService");

const app = express();

const PORT = process.env.PORT || 4000;

let allowedOrigins = [];
try {
  allowedOrigins = JSON.parse(process.env.ALLOWED_ORIGINS || "[]");
  if (process.env.NODE_ENV === 'production') {
    allowedOrigins = allowedOrigins.filter(o => !o.includes('localhost'));
  }
} catch (err) {
  console.error("ALLOWED_ORIGINS no es un JSON válido:", err.message);
  process.exit(1);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
  credentials: true
};

app.set('trust proxy', 1);
app.use(helmet());
app.use("/api/webhooks", webhookRouter);
app.use(cors(corsOptions));

app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.headers.origin;
  if (origin) {
    if (allowedOrigins.includes(origin)) return next();
    console.error(`CSRF blocked: origin=${origin}, method=${req.method}, url=${req.originalUrl}`);
    return res.status(403).json({ success: false, code: "CSRF_ORIGIN_MISMATCH", friendlyMessage: "Origen no permitido." });
  }

  const referer = req.headers.referer;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (allowedOrigins.includes(refererOrigin)) return next();
    } catch {}
    console.error(`CSRF blocked: referer=${referer}, method=${req.method}, url=${req.originalUrl}`);
    return res.status(403).json({ success: false, code: "CSRF_ORIGIN_MISMATCH", friendlyMessage: "Origen no permitido." });
  }

  return next();
});

app.use(cookieParser(process.env.SECRET));
app.use(express.json({ limit: '1mb' }));
app.use(globalLimiter);

app.use("/api/auth", authRouter);
app.use("/api/profile-photo", profilePhotoRouter);
app.use("/api/user", userRouter);
app.use("/api/lesson", lessonRouter);
app.use("/api/instruction", instructionRouter);
app.use("/api/product-key", productKeyRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/prompt", promptRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/store", storeRouter);
app.use("/api/chest", chestRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/subscription", subscriptionRouter);

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    console.error(`JSON parse error from ${req.ip} on ${req.method} ${req.originalUrl}`);
    return res.status(400).json({
      success: false,
      code: "VALIDATION_INVALID_JSON",
      type: "error",
      showAlert: true,
      title: "JSON inválido",
      techMessage: "Invalid JSON in request body.",
      friendlyMessage: "El formato de los datos enviados es inválido.",
    });
  }
  console.error(err);
  return res.status(500).json({
    success: false,
    code: "SERVER_ERROR",
    type: "error",
    showAlert: true,
    title: "Error del servidor",
    techMessage: "Internal server error.",
    friendlyMessage: "Ocurrió un error inesperado. Intentá de nuevo más tarde.",
  });
});

mongoose.connect(process.env.DB_URL)
  .then(() => {
    console.log("Conectado a la base de datos.");

    const server = app.listen(PORT, () => {
      console.log(`API Rest escuchando el puerto ${PORT}`);
    });

    // ─── Cron jobs (node-cron with America/Argentina/Buenos_Aires timezone) ───
    const cronOpts = { timezone: 'America/Argentina/Buenos_Aires' };

    const runCron = (name, fn) => {
      const start = Date.now();
      fn()
        .then(() => console.info(`[Cron] ${name} completed in ${Date.now() - start}ms`))
        .catch(err => console.error(`[Cron] ${name} failed:`, err.message));
    };

    // Payment reconciliation — every 15 min
    runCron('reconcilePayments', reconcilePayments);
    cron.schedule('*/15 * * * *', () => runCron('reconcilePayments', reconcilePayments), cronOpts);

    // Expire cancelled subscriptions — every 30 min
    runCron('expireCancelledSubscriptions', expireCancelledSubscriptions);
    cron.schedule('*/30 * * * *', () => runCron('expireCancelledSubscriptions', expireCancelledSubscriptions), cronOpts);

    // Pre-renewal email notifications — daily at 10:00 AM
    cron.schedule('0 10 * * *', () => runCron('sendPreRenewalNotifications', sendPreRenewalNotifications), cronOpts);

    // Subscription reconciliation — hot every 6h (at :05 past), cold daily at 4:00 AM
    runCron('reconcileHot', reconcileHot);
    cron.schedule('5 */6 * * *', () => runCron('reconcileHot', reconcileHot), cronOpts);
    cron.schedule('0 4 * * *', () => runCron('reconcileCold', reconcileCold), cronOpts);

    // Webhook health check — every 12h (at :10 past)
    cron.schedule('10 */12 * * *', () => runCron('checkWebhookHealth', checkWebhookHealth), cronOpts);

    // Retry failed demo transfers — every 1h
    cron.schedule('30 * * * *', () => runCron('retryFailedDemoTransfers', retryFailedDemoTransfers), cronOpts);

    // Retry failed subscription emails — every 2h (at :45 past)
    cron.schedule('45 */2 * * *', () => runCron('retryFailedEmails', retryFailedEmails), cronOpts);

    const gracefulShutdown = (signal) => {
      console.log(`${signal} recibido. Cerrando servidor...`);
      server.close(() => {
        console.log('Servidor HTTP cerrado.');
        mongoose.connection.close(false).then(() => {
          console.log('Conexión a MongoDB cerrada.');
          process.exit(0);
        });
      });
      setTimeout(() => {
        console.error('Shutdown forzado por timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  })
  .catch((error) => {
    console.error("Error conectando a la base de datos:", error.message);
    process.exit(1);
  });