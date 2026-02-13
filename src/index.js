const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRouter = require("./routes/authRoutes");
const profilePhotoRouter = require("./routes/profilePhotoRoutes");
const userRouter = require("./routes/userRoutes");
const lessonRouter = require("./routes/lessonRoutes");
const instructionRouter = require("./routes/instructionRoutes");
const productKeyRouter = require("./routes/productKeyRoutes");
const rankingRouter = require("./routes/rankingRoutes");
const promptRouter = require("./routes/promptRoutes");
const assistantRouter = require("./routes/assistantRoutes");

const app = express();

const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.DB_URL).catch((error) => console.log(error)).then(() => console.log("Conectado a la base de datos."));

const allowedOrigins = JSON.parse(process.env.ALLOWED_ORIGINS||"[]")

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', true);

app.use("/api/auth", authRouter);
app.use("/api/profile-photo", profilePhotoRouter);
app.use("/api/user", userRouter);
app.use("/api/lesson", lessonRouter);
app.use("/api/instruction", instructionRouter);
app.use("/api/product-key", productKeyRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/prompt", promptRouter);
app.use("/api/assistant", assistantRouter);

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    console.error(`JSON parse error from ${req.ip} on ${req.method} ${req.originalUrl}`);
    return res.status(400).json({
      success: false,
      msg: "JSON inválido en el body del request.",
    });
  }
  console.error(err);
  return res.status(500).json({
    success: false,
    msg: "Error interno del servidor.",
  });
});

app.listen(PORT, () => {
  console.log(`API Rest escuchando el puerto ${PORT}`);
});