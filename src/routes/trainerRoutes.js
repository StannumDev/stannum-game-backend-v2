const { Router } = require("express");
const { check, body } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { isAdmin } = require("../middlewares/isAdmin");
const { trainerLimiter, feedbackInteractionLimiter } = require("../middlewares/rateLimiter");
const trainerController = require("../controllers/trainerController");

const router = Router();

const askValidators = [
    validateJWT,
    check("question", "La pregunta es requerida.")
        .trim().notEmpty().withMessage("La pregunta no puede estar vacía.")
        .isLength({ min: 2, max: 800 }).withMessage("La pregunta debe tener entre 2 y 800 caracteres."),
    check("programId", "programId inválido.").optional({ checkFalsy: true }).trim().isString(), // ausente/null = modo general (lo resuelve prepareAsk)
    check("lessonId", "lessonId inválido.").optional().trim().isLength({ max: 40 }),
    body("history", "history debe ser un arreglo.").optional().isArray({ max: 12 }),
    body("history.*", "history item inválido.").optional().isObject(), // rechaza [null], [123], ["x"]: si no, role/content .optional() los dejarían pasar y romperían buildInput
    body("history.*.role", "role inválido.").optional().isIn(["user", "assistant"]),
    body("history.*.content", "content inválido.").optional().isString().isLength({ max: 2000 }),
    fieldsValidate,
];

router.post("/ask", askValidators, trainerLimiter, trainerController.ask);
router.post("/ask/stream", askValidators, trainerLimiter, trainerController.askStream);

router.get(
    "/chapters",
    [
        validateJWT,
        check("programId", "programId requerido.").trim().notEmpty(),
        check("lessonId", "lessonId requerido.").trim().notEmpty().isLength({ max: 40 }),
        fieldsValidate,
    ],
    trainerLimiter,
    trainerController.chapters
);

router.post(
    "/feedback",
    [
        validateJWT,
        check("interactionId", "interactionId inválido.").isMongoId(),
        check("value", "value debe ser 1, -1 o 0.").isInt().toInt().isIn([1, -1, 0]),
        fieldsValidate,
    ],
    feedbackInteractionLimiter,
    trainerController.feedback
);

router.get("/health", [validateJWT, isAdmin], trainerController.health);
router.get("/metrics", [validateJWT, isAdmin], trainerController.metrics);
router.post("/reload-index", [validateJWT, isAdmin], trainerController.reloadIndex);

module.exports = router;
