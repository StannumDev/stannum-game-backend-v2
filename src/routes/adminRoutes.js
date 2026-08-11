const { Router } = require("express");
const { query, param, body } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { getError } = require("../helpers/getError");
const { validateAPIKey } = require("../middlewares/validateAPIKey");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { getUser, getUsers, getStats, getEnterprises, setProgramAccess } = require("../controllers/adminController");
const { listFeedback, markResolved, getFeedbackStats } = require("../controllers/feedbackController");
const {
    listOrders,
    listCoupons,
    listSubscriptionPayments,
    listSubscriptionAudit,
    listPrompts,
    listAssistants,
} = require("../controllers/adminReadController");

const router = Router();

// The read-only MCP mounted in the same process calls these endpoints over
// loopback (127.0.0.1), so a single MCP session fanning out several queries
// would otherwise burn the per-IP admin budget. Loopback == this server, so
// it's safe to skip the limiter for it (external traffic arrives via the proxy
// with real client IPs).
const isLoopback = (req) =>
    req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1";

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json(getError("AUTH_TOO_MANY_ATTEMPTS")),
    keyGenerator: (req) => req.ip,
    skip: isLoopback,
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
    skip: isLoopback,
});

// GET /api/admin/user?email=X&username=Y
router.get(
    "/user",
    [
        validateAPIKey,
        adminLimiter,
        query("email").optional().trim().isEmail().normalizeEmail({ gmail_remove_dots: false }),
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

// ── Read-only endpoints for the Game MCP (orders / coupons / subscriptions / community) ──

// GET /api/admin/orders?status=&userId=&programId=&page=&limit=
router.get(
    "/orders",
    [
        validateAPIKey,
        adminLimiter,
        query("status").optional().trim().isLength({ max: 30 }),
        query("userId").optional().trim().isMongoId(),
        query("programId").optional().trim().isLength({ max: 50 }),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        fieldsValidate,
    ],
    listOrders
);

// GET /api/admin/coupons?isActive=&page=&limit=
router.get(
    "/coupons",
    [
        validateAPIKey,
        adminLimiter,
        query("isActive").optional().isIn(["true", "false"]),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        fieldsValidate,
    ],
    listCoupons
);

// GET /api/admin/subscription-payments?userId=&status=&programId=&page=&limit=
router.get(
    "/subscription-payments",
    [
        validateAPIKey,
        adminLimiter,
        query("userId").optional().trim().isMongoId(),
        query("status").optional().trim().isLength({ max: 30 }),
        query("programId").optional().trim().isLength({ max: 50 }),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        fieldsValidate,
    ],
    listSubscriptionPayments
);

// GET /api/admin/subscription-audit?userId=&programId=&trigger=&page=&limit=
router.get(
    "/subscription-audit",
    [
        validateAPIKey,
        adminLimiter,
        query("userId").optional().trim().isMongoId(),
        query("programId").optional().trim().isLength({ max: 50 }),
        query("trigger").optional().trim().isLength({ max: 30 }),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        fieldsValidate,
    ],
    listSubscriptionAudit
);

// GET /api/admin/community/prompts?category=&visibility=&search=&page=&limit=
router.get(
    "/community/prompts",
    [
        validateAPIKey,
        adminLimiter,
        query("category").optional().trim().isLength({ max: 50 }),
        query("visibility").optional().trim().isLength({ max: 30 }),
        query("search").optional().trim().isLength({ max: 100 }),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        fieldsValidate,
    ],
    listPrompts
);

// GET /api/admin/community/assistants?category=&visibility=&search=&page=&limit=
router.get(
    "/community/assistants",
    [
        validateAPIKey,
        adminLimiter,
        query("category").optional().trim().isLength({ max: 50 }),
        query("visibility").optional().trim().isLength({ max: 30 }),
        query("search").optional().trim().isLength({ max: 100 }),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        fieldsValidate,
    ],
    listAssistants
);

module.exports = router;
