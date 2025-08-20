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

const app = express();

const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.DB_URL)
  .catch((error) => console.log(error))
  .then(() => console.log("Conectado a la base de datos."));
    
const allowedOrigins = [
  'https://stannumgamev2prueba.netlify.app',
  'https://stannumgame.com',
  'http://localhost:3000'
];

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
app.use(express.json());
// app.set('trust proxy', true);

app.use("/api/auth", authRouter);
app.use("/api/profile-photo", profilePhotoRouter);
app.use("/api/user", userRouter);
app.use("/api/lesson", lessonRouter);
app.use("/api/instruction", instructionRouter);
app.use("/api/product-key", productKeyRouter);
app.use("/api/ranking", rankingRouter);

app.listen(PORT, () => {
  console.log(`API Rest escuchando el puerto ${PORT}`);
});