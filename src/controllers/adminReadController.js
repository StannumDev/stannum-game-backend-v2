const Order = require("../models/orderModel");
const Coupon = require("../models/couponModel");
const SubscriptionPayment = require("../models/subscriptionPaymentModel");
const SubscriptionAuditLog = require("../models/subscriptionAuditLogModel");
const Prompt = require("../models/promptModel");
const Assistant = require("../models/assistantModel");
const { getError } = require("../helpers/getError");

/**
 * Read-only admin endpoints that close the coverage gap for the STANNUM Game
 * MCP (orders, coupons, subscription payments/audit, community prompts &
 * assistants). All are gated by `x-api-key` (see adminRoutes.js) and paginated.
 *
 * PII policy (decided for the MCP consumer): business/financial data is exposed
 * in full (emails, amounts, MercadoPago ids). Only credentials/secrets are ever
 * withheld — none of these collections hold any, so no field-level censoring is
 * needed here beyond dropping heavy engagement arrays on the community models.
 */

const clampLimit = (raw, def = 20, max = 100) =>
    Math.min(max, Math.max(1, parseInt(raw) || def));

// Escape user input before using it as a MongoDB $regex pattern — prevents
// regex injection / catastrophic-backtracking (ReDoS) via the `search` filter.
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── GET /api/admin/orders?status=&userId=&page=&limit= ──
const listOrders = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = clampLimit(req.query.limit);
        const { status, userId, programId } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (userId) filter.userId = userId;
        if (programId) filter.programId = programId;

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .populate("userId", "username email")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            orders,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error("Error in admin listOrders:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /api/admin/coupons?isActive=&page=&limit= ──
const listCoupons = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = clampLimit(req.query.limit);
        const filter = {};
        if (req.query.isActive === "true") filter.isActive = true;
        if (req.query.isActive === "false") filter.isActive = false;

        const [coupons, total] = await Promise.all([
            Coupon.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Coupon.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            coupons,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error("Error in admin listCoupons:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /api/admin/subscription-payments?userId=&status=&page=&limit= ──
const listSubscriptionPayments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = clampLimit(req.query.limit);
        const { userId, status, programId } = req.query;

        const filter = {};
        if (userId) filter.userId = userId;
        if (status) filter.status = status;
        if (programId) filter.programId = programId;

        const [payments, total] = await Promise.all([
            SubscriptionPayment.find(filter)
                .populate("userId", "username email")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            SubscriptionPayment.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            payments,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error("Error in admin listSubscriptionPayments:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /api/admin/subscription-audit?userId=&programId=&page=&limit= ──
const listSubscriptionAudit = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = clampLimit(req.query.limit);
        const { userId, programId, trigger } = req.query;

        const filter = {};
        if (userId) filter.userId = userId;
        if (programId) filter.programId = programId;
        if (trigger) filter.trigger = trigger;

        const [logs, total] = await Promise.all([
            SubscriptionAuditLog.find(filter)
                .populate("userId", "username email")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            SubscriptionAuditLog.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error("Error in admin listSubscriptionAudit:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// Drop heavy engagement arrays from community docs (not needed for browsing).
const COMMUNITY_PROJECTION = { likedBy: 0, favoritedBy: 0, searchKeywords: 0 };

// ── GET /api/admin/community/prompts?category=&visibility=&search=&page=&limit= ──
const listPrompts = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = clampLimit(req.query.limit);
        const { category, visibility, search } = req.query;

        const filter = {};
        if (category) filter.category = category;
        if (visibility) filter.visibility = visibility;
        if (search) {
            const rx = escapeRegex(search);
            filter.$or = [
                { title: { $regex: rx, $options: "i" } },
                { description: { $regex: rx, $options: "i" } },
            ];
        }

        const [prompts, total] = await Promise.all([
            Prompt.find(filter, COMMUNITY_PROJECTION)
                .populate("author", "username email")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Prompt.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            prompts,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error("Error in admin listPrompts:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /api/admin/community/assistants?category=&visibility=&search=&page=&limit= ──
const listAssistants = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = clampLimit(req.query.limit);
        const { category, visibility, search } = req.query;

        const filter = {};
        if (category) filter.category = category;
        if (visibility) filter.visibility = visibility;
        if (search) {
            const rx = escapeRegex(search);
            filter.$or = [
                { title: { $regex: rx, $options: "i" } },
                { description: { $regex: rx, $options: "i" } },
            ];
        }

        const [assistants, total] = await Promise.all([
            Assistant.find(filter, COMMUNITY_PROJECTION)
                .populate("author", "username email")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Assistant.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            assistants,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error("Error in admin listAssistants:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = {
    listOrders,
    listCoupons,
    listSubscriptionPayments,
    listSubscriptionAudit,
    listPrompts,
    listAssistants,
};
