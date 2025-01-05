const rateLimit = require("express-rate-limit");
const { getError } = require("../helpers/getError");

const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
        const error = getError("AUTH_TOO_MANY_ATTEMPTS");
        return res.status(429).json(error);
    },
});

module.exports = { loginLimiter };