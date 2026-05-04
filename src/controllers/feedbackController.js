const Feedback = require("../models/feedbackModel");
const User = require("../models/userModel");
const { getError } = require("../helpers/getError");
const { invalidateUser } = require("../cache/cacheService");
const { sendErrorAlert, computeStackHash } = require("../services/feedbackEmailService");

const VALID_TYPES = ["lesson", "instruction", "nps", "onboarding", "error"];
const VALID_REACTIONS = ["up", "down"];
const MESSAGE_MAX_LEN = 2000;
const STACK_MAX_LEN = 4000;
const ERROR_MESSAGE_MAX_LEN = 500;
const ROUTE_MAX_LEN = 200;
const USER_AGENT_MAX_LEN = 500;

const sanitizeText = (str, maxLen) => {
  if (str == null) return "";
  return String(str)
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
};

const sanitizeContext = (ctx = {}) => ({
  lessonId: ctx.lessonId ? sanitizeText(ctx.lessonId, 100) : null,
  instructionId: ctx.instructionId ? sanitizeText(ctx.instructionId, 100) : null,
  programId: ctx.programId ? sanitizeText(ctx.programId, 100) : null,
  route: ctx.route ? sanitizeText(ctx.route, ROUTE_MAX_LEN) : null,
  appVersion: ctx.appVersion ? sanitizeText(ctx.appVersion, 50) : null,
  userAgent: ctx.userAgent ? String(ctx.userAgent).slice(0, USER_AGENT_MAX_LEN) : null,
});

const stampFeedbackState = async (userId, type) => {
  const set = {};
  const push = {};
  if (type === "nps") set["feedbackState.lastNpsAt"] = new Date();
  if (type === "onboarding") set["feedbackState.lastOnboardingFeedbackAt"] = new Date();
  if (Object.keys(set).length === 0 && Object.keys(push).length === 0) return;
  try {
    const update = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(push).length > 0) update.$push = push;
    await User.updateOne({ _id: userId }, update);
    invalidateUser(userId.toString());
  } catch (err) {
    console.error("[Feedback] Falló stamp feedbackState:", err.message);
  }
};

const createFeedback = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const {
      type,
      rating,
      reaction,
      secondaryReactions,
      message,
      requestId,
      context,
    } = req.body || {};

    if (!VALID_TYPES.includes(type) || type === "error") {
      return res.status(400).json(getError("FEEDBACK_INVALID_TYPE"));
    }

    if (rating != null) {
      const r = Number(rating);
      if (Number.isNaN(r) || r < 0 || r > 10) {
        return res.status(400).json(getError("FEEDBACK_INVALID_RATING"));
      }
    }
    if (reaction != null && !VALID_REACTIONS.includes(reaction)) {
      return res.status(400).json(getError("FEEDBACK_INVALID_REACTION"));
    }

    const cleanSecondary = {
      evaluationFair: VALID_REACTIONS.includes(secondaryReactions?.evaluationFair) ? secondaryReactions.evaluationFair : null,
      instructionsClear: VALID_REACTIONS.includes(secondaryReactions?.instructionsClear) ? secondaryReactions.instructionsClear : null,
    };

    const cleanMessage = sanitizeText(message, MESSAGE_MAX_LEN);
    const cleanContext = sanitizeContext(context);
    const cleanRequestId = requestId ? sanitizeText(requestId, 80) : null;

    let feedback;
    try {
      feedback = await Feedback.create({
        userId,
        type,
        rating: rating != null ? Number(rating) : null,
        reaction: reaction || null,
        secondaryReactions: cleanSecondary,
        message: cleanMessage,
        requestId: cleanRequestId,
        context: cleanContext,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        const existing = cleanRequestId
          ? await Feedback.findOne({ requestId: cleanRequestId, userId }).lean()
          : null;
        return res.status(200).json({
          success: true,
          idempotent: true,
          data: existing ? { id: existing._id, type: existing.type, createdAt: existing.createdAt } : null,
        });
      }
      throw err;
    }

    await stampFeedbackState(userId, type);

    return res.status(201).json({
      success: true,
      data: { id: feedback._id, type: feedback.type, createdAt: feedback.createdAt },
    });
  } catch (error) {
    console.error("[Feedback] createFeedback error:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const createErrorFeedback = async (req, res) => {
  try {
    const { userId, requestId, context, errorPayload } = req.body || {};

    if (!errorPayload || (!errorPayload.stack && !errorPayload.message)) {
      return res.status(400).json(getError("FEEDBACK_INVALID_ERROR_PAYLOAD"));
    }

    const cleanStack = errorPayload.stack ? sanitizeText(errorPayload.stack, STACK_MAX_LEN) : null;
    const cleanErrorMessage = errorPayload.message ? sanitizeText(errorPayload.message, ERROR_MESSAGE_MAX_LEN) : null;
    const cleanRoute = errorPayload.route ? sanitizeText(errorPayload.route, ROUTE_MAX_LEN) : null;
    const statusCode = errorPayload.statusCode != null ? Number(errorPayload.statusCode) : null;
    const stackHash = cleanStack ? computeStackHash(cleanStack) : null;

    const cleanContext = sanitizeContext(context);
    const cleanRequestId = requestId ? sanitizeText(requestId, 80) : null;

    const validUserId = userId && /^[0-9a-fA-F]{24}$/.test(userId) ? userId : null;

    let feedback;
    try {
      feedback = await Feedback.create({
        userId: validUserId,
        type: "error",
        message: "",
        requestId: cleanRequestId,
        context: cleanContext,
        errorPayload: {
          stack: cleanStack,
          stackHash,
          message: cleanErrorMessage,
          route: cleanRoute,
          statusCode: Number.isFinite(statusCode) ? statusCode : null,
        },
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(200).json({ success: true, idempotent: true });
      }
      throw err;
    }

    sendErrorAlert(feedback).catch(e => console.error("[Feedback] sendErrorAlert error:", e?.message));

    return res.status(201).json({ success: true, data: { id: feedback._id } });
  } catch (error) {
    console.error("[Feedback] createErrorFeedback error:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const listFeedback = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const cursor = req.query.cursor;
    const type = req.query.type;
    const resolved = req.query.resolved;
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const filter = {};
    if (type && VALID_TYPES.includes(type)) filter.type = type;
    if (resolved === "true") filter.resolved = true;
    if (resolved === "false") filter.resolved = false;
    if (from || to) {
      filter.createdAt = {};
      if (from && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
      if (to && !Number.isNaN(to.getTime())) filter.createdAt.$lte = to;
    }
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        filter.createdAt = { ...(filter.createdAt || {}), $lt: cursorDate };
      }
    }

    const items = await Feedback.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null;

    return res.status(200).json({ success: true, data, nextCursor });
  } catch (error) {
    console.error("[Feedback] listFeedback error:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const markResolved = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json(getError("FEEDBACK_NOT_FOUND"));
    }
    const result = await Feedback.findByIdAndUpdate(id, { resolved: true }, { new: true }).lean();
    if (!result) return res.status(404).json(getError("FEEDBACK_NOT_FOUND"));
    return res.status(200).json({ success: true, data: { id: result._id, resolved: result.resolved } });
  } catch (error) {
    console.error("[Feedback] markResolved error:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { createFeedback, createErrorFeedback, listFeedback, markResolved };
