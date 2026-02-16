const crypto = require("crypto");
const { getError } = require("./getError");

const REFRESH_TOKEN_DAYS = 7;

const newRefreshToken = () => {
  if (!process.env.REFRESH_SECRET) throw getError("JWT_SECRET_NOT_SET");
  const token = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  const hashedToken = crypto
    .createHmac("sha256", process.env.REFRESH_SECRET)
    .update(token)
    .digest("hex");

  return { token, hashedToken, expiresAt };
};

const hashRefreshToken = (token) => {
  if (!process.env.REFRESH_SECRET) throw getError("JWT_SECRET_NOT_SET");
  return crypto
    .createHmac("sha256", process.env.REFRESH_SECRET)
    .update(token)
    .digest("hex");
};

module.exports = { newRefreshToken, hashRefreshToken };
