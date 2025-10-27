const rateLimit = require("express-rate-limit");
const { getError } = require("../helpers/getError");

const rateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const error = getError("AUTH_TOO_MANY_ATTEMPTS");
        return res.status(429).json(error);
    },
    keyGenerator: (req) => {
        return req.ip;
    },
});

const searchRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const error = getError("AUTH_TOO_MANY_ATTEMPTS");
        return res.status(429).json(error);
    },
    keyGenerator: (req) => {
        return req.ip;
    },
});

module.exports = { rateLimiter, searchRateLimiter };