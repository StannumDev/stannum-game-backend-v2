const { Router } = require("express");
const { query, param, body } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { getError } = require("../helpers/getError");
const { validateAPIKey } = require("../middlewares/validateAPIKey");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { getUser, getUsers, getStats, getEnterprises, setProgramAccess } = require("../controllers/adminController");
const { listFeedback, markResolved, getFeedbackStats } = require("../controllers/feedbackController");

const router = Router();

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json(getError("AUTH_TOO_MANY_ATTEMPTS")),
    keyGenerator: (req) => req.ip,
});

// Higher limit for feedback browsing — admin dashboards make many calls
// (list + stats + paginate + resolve), and traffic typically arrives from
// a single egress IP (the Trenno dashboard backend).
const feedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
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

// PATCH /api/admin/user/:username/programs/:programId/access
router.patch(
    "/user/:username/programs/:programId/access",
    [
        validateAPIKey,
        adminLimiter,
        param("username").trim().isLength({ min: 1, max: 50 }),
        param("programId").trim().isLength({ min: 1, max: 50 }),
        body("grant").exists().isBoolean({ strict: true }).toBoolean(),
        fieldsValidate,
    ],
    setProgramAccess
);

// GET /api/admin/feedback
router.get(
    "/feedback",
    [
        validateAPIKey,
        feedbackLimiter,
        query("type").optional().trim().isLength({ max: 50 }),
        query("resolved").optional().isIn(["true", "false"]),
        query("from").optional().isISO8601(),
        query("to").optional().isISO8601(),
        query("cursor").optional().isISO8601(),
        query("limit").optional().isInt({ min: 1, max: 200 }),
        fieldsValidate,
    ],
    listFeedback
);

// GET /api/admin/feedback/stats
router.get(
    "/feedback/stats",
    [validateAPIKey, feedbackLimiter],
    getFeedbackStats
);

// PATCH /api/admin/feedback/:id/resolve
router.patch(
    "/feedback/:id/resolve",
    [validateAPIKey, feedbackLimiter],
    markResolved
);

module.exports = router;
