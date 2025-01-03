const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRouter = require("./routes/authRoutes");

const app = express();

const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.DB_URL)
  .catch((error) => console.log(error))
  .then(() => console.log("Conectado a la base de datos."));
    
const allowedOrigins = [
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

app.use("/api/auth", authRouter);

app.listen(PORT, () => {
  console.log(`API Rest escuchando el puerto ${PORT}`);
});