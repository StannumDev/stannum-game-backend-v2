const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const lessonController = require("../controllers/lessonController");

const router = Router();

router.post(
    "/complete/:programName/:lessonId",
    [
        validateJWT,
        check("programName").trim().escape().not().isEmpty().withMessage("El nombre del programa no puede estar vacío.").isLength({ min: 2, max: 50 }).withMessage("El nombre del programa debe tener entre 2 y 50 caracteres.").matches(/^[a-zA-Z0-9_-]+$/).withMessage("El nombre del programa solo puede contener letras, números, guiones y guiones bajos."),
        check("lessonId").trim().escape().not().isEmpty().withMessage("El ID de la lección no puede estar vacío."),
        fieldsValidate,
    ],
    lessonController.markLessonAsCompleted
);

router.patch(
    "/lastwatched/:programName/:lessonId",
    [
        validateJWT,
        check("programName").trim().escape().not().isEmpty().isLength({ min: 2, max: 50 }),
        check("lessonId").trim().escape().not().isEmpty(),
        check("currentTime", "El tiempo actual es obligatorio.").isNumeric().withMessage("currentTime debe ser un número."),
        fieldsValidate,
    ],
    lessonController.updateLastWatched
);

module.exports = router;