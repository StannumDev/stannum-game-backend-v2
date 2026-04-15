const { Router } = require("express");
const { query } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { getError } = require("../helpers/getError");
const { validateAPIKey } = require("../middlewares/validateAPIKey");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { getUser, getUsers, getStats, getEnterprises } = require("../controllers/adminController");

const router = Router();

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json(getError("AUTH_TOO_MANY_ATTEMPTS")),
    keyGenerator: (req) => req.ip,
});

// GET /api/admin/user?email=X&username=Y
router.get(
    "/user",
    [
        validateAPIKey,
        adminLimiter,
        query("email").optional().trim().isEmail().normalizeEmail(),
        query("username").optional().trim().isLength({ min: 1, max: 50 }),
        fieldsValidate,
    ],
    getUser
);

// GET /api/admin/users?enterprise=X&search=Y&page=1&limit=20
router.get(
    "/users",
    [
        validateAPIKey,
        adminLimiter,
        query("enterprise").optional().trim().isLength({ max: 100 }),
        query("search").optional().trim().isLength({ max: 100 }),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        fieldsValidate,
    ],
    getUsers
);

// GET /api/admin/stats
router.get(
    "/stats",
    [validateAPIKey, adminLimiter],
    getStats
);

// GET /api/admin/enterprises
router.get(
    "/enterprises",
    [validateAPIKey, adminLimiter],
    getEnterprises
);

module.exports = router;
