const { Router } = require("express");
const { check, body } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { isAdmin } = require("../middlewares/isAdmin");
const { trainerLimiter } = require("../middlewares/rateLimiter");
const trainerController = require("../controllers/trainerController");

const router = Router();

router.post(
    "/ask",
    [
        validateJWT,
        check("question", "La pregunta es requerida.")
            .trim().notEmpty().withMessage("La pregunta no puede estar vacía.")
            .isLength({ min: 2, max: 800 }).withMessage("La pregunta debe tener entre 2 y 800 caracteres."),
        check("programId", "El programa es requerido.").trim().notEmpty().withMessage("programId requerido."),
        check("lessonId", "lessonId inválido.").optional().trim().isLength({ max: 40 }),
        body("history", "history debe ser un arreglo.").optional().isArray({ max: 12 }),
        body("history.*.role", "role inválido.").optional().isIn(["user", "assistant"]),
        body("history.*.content", "content inválido.").optional().isString().isLength({ max: 2000 }),
        fieldsValidate,
    ],
    trainerLimiter,
    trainerController.ask
);

router.get("/health", [validateJWT, isAdmin], trainerController.health);

module.exports = router;
