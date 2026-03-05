const crypto = require("crypto");
const { getError } = require("../helpers/getError");

const validateAPIKey = (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
    if (!apiKey) return res.status(401).json(getError("AUTH_API_KEY_MISSING"));
    const expected = Buffer.from(process.env.MAKE_API_KEY || "");
    const received = Buffer.from(apiKey);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      return res.status(403).json(getError("AUTH_API_KEY_INVALID"));
    }
    next();
  } catch (error) {
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { validateAPIKey };