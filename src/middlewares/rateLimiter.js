const rateLimit = require("express-rate-limit");
const { getError } = require("../helpers/getError");

const rateLimitHandler = (req, res) => {
    const error = getError("AUTH_TOO_MANY_ATTEMPTS");
    return res.status(429).json(error);
};

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.ip,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.body?.username?.toLowerCase() || req.body?.email?.toLowerCase() || req.ip,
});

// Google login no expone username/email en el body (el email va dentro del access token
// opaco de Google), así que solo se puede keyear por IP. Un límite alto evita que cohortes
// presenciales detrás de una misma IP/NAT se autobloqueen (429) al loguearse con Google.
const googleAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.ip,
});

const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.uid || req.ip,
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.ip,
});

const submissionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.uid || req.ip,
});

const validationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.body?.email?.toLowerCase() || req.body?.username?.toLowerCase() || req.ip,
});

const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.ip,
});

const contentCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.uid || req.ip,
});

const sensitiveOperationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.uid || req.ip,
});

const passwordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.body?.username?.toLowerCase() || req.body?.email?.toLowerCase() || req.ip,
});

const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.userAuth?.id || req.ip,
});

const gradingRetryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.userAuth?.id || req.ip,
});

const feedbackNpsLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.userAuth?.id?.toString() || req.ip,
});

const feedbackOnboardingLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.userAuth?.id?.toString() || req.ip,
});

const feedbackInteractionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.userAuth?.id?.toString() || req.ip,
});

const errorIngestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => req.ip,
});

module.exports = {
    globalLimiter,
    authLimiter,
    googleAuthLimiter,
    searchLimiter,
    otpLimiter,
    submissionLimiter,
    validationLimiter,
    refreshLimiter,
    contentCreationLimiter,
    sensitiveOperationLimiter,
    passwordLimiter,
    paymentLimiter,
    gradingRetryLimiter,
    feedbackNpsLimiter,
    feedbackOnboardingLimiter,
    feedbackInteractionLimiter,
    errorIngestLimiter,
};
