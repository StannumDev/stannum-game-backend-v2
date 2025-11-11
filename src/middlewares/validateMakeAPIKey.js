const { getError } = require("../helpers/getError");

const validateMakeAPIKey = (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
    if (!apiKey) return res.status(401).json(getError("AUTH_API_KEY_MISSING"));
    if (apiKey !== process.env.MAKE_API_KEY) return res.status(403).json(getError("AUTH_API_KEY_INVALID"));
    next();
  } catch (error) {
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { validateMakeAPIKey };