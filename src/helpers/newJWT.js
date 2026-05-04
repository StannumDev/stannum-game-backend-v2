const jwt = require("jsonwebtoken");
const { getError } = require("../helpers/getError");

const newJWT = async (id = "", role = "USER", { extraPayload = {}, expiresIn } = {}) => {
  if (!process.env.SECRET) throw getError("JWT_SECRET_NOT_SET");
  const payload = { id, role, ...extraPayload };
  const ttl = expiresIn || process.env.ACCESS_TOKEN_EXPIRY || "15m";
  try {
    const token = await new Promise((resolve, reject) => {
      jwt.sign(payload, process.env.SECRET, { expiresIn: ttl }, (error, token) => {
        if (error) {
          console.error("JWT Generation Error:", error.message);
          reject(getError("JWT_GENERATION_FAILED"));
        } else {
          resolve(token);
        }
      });
    });

    return token;
  } catch (error) {
    console.error("Error generating JWT:", error);
    throw error;
  }
};

module.exports = { newJWT };