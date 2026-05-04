const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { validateAPIKey } = require("../middlewares/validateAPIKey");
const { isAdmin } = require("../middlewares/isAdmin");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const {
  feedbackNpsLimiter,
  feedbackOnboardingLimiter,
  feedbackInteractionLimiter,
  errorIngestLimiter,
} = require("../middlewares/rateLimiter");

const feedbackController = require("../controllers/feedbackController");

const router = Router();

const dispatchFeedbackLimiter = (req, res, next) => {
  const type = req.body?.type;
  if (type === "nps") return feedbackNpsLimiter(req, res, next);
  if (type === "onboarding") return feedbackOnboardingLimiter(req, res, next);
  return feedbackInteractionLimiter(req, res, next);
};

router.post(
  "/error",
  [validateAPIKey, errorIngestLimiter],
  feedbackController.createErrorFeedback
);

router.post(
  "/",
  [
    validateJWT,
    dispatchFeedbackLimiter,
    check("type", "El tipo de feedback es obligatorio.").trim().isIn(["lesson", "instruction", "nps", "onboarding"]).withMessage("Tipo de feedback inválido."),
    check("rating").optional({ nullable: true }).isFloat({ min: 0, max: 10 }).withMessage("Rating debe estar entre 0 y 10."),
    check("reaction").optional({ nullable: true }).isIn(["up", "down"]).withMessage("Reaction inválida."),
    check("message").optional({ nullable: true }).isString().isLength({ max: 2000 }).withMessage("El mensaje no puede superar los 2000 caracteres."),
    check("requestId").optional({ nullable: true }).isString().isLength({ max: 80 }).withMessage("requestId inválido."),
    check("context").optional({ nullable: true }).isObject().withMessage("context debe ser un objeto."),
    fieldsValidate,
  ],
  feedbackController.createFeedback
);

router.get(
  "/",
  [validateJWT, isAdmin],
  feedbackController.listFeedback
);

router.patch(
  "/:id/resolve",
  [validateJWT, isAdmin],
  feedbackController.markResolved
);

module.exports = router;
