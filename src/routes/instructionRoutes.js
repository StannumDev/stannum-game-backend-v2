const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { isAdmin } = require("../middlewares/isAdmin");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const instructionController = require("../controllers/instructionController");

const router = Router();

router.post(
  "/start/:programName/:instructionId",
  [
    validateJWT,
    check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty().withMessage("El nombre del programa no puede estar vacío."),
    check("instructionId", "El ID de la instrucción es obligatorio.").trim().escape().notEmpty().withMessage("El ID de la instrucción no puede estar vacío."),
    fieldsValidate,
  ],
  instructionController.startInstruction
);

router.post(
  "/presign/:programName/:instructionId",
  [
    validateJWT,
    check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty().withMessage("El nombre del programa no puede estar vacío."),
    check("instructionId", "El ID de la instrucción es obligatorio.").trim().escape().notEmpty().withMessage("El ID de la instrucción no puede estar vacío."),
    fieldsValidate,
  ],
  instructionController.getPresignedUrl
);

router.post(
  "/submit/:programName/:instructionId",
  [
    validateJWT,
    check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty().withMessage("El nombre del programa no puede estar vacío."),
    check("instructionId", "El ID de la instrucción es obligatorio.").trim().escape().notEmpty().withMessage("El ID de la instrucción no puede estar vacío."),
    fieldsValidate,
  ],
  instructionController.submitInstruction
);

router.post(
  "/grade/:userId/:programName/:instructionId",
  [
    validateJWT,
    isAdmin,
    check("userId", "El ID del usuario es obligatorio.").trim().escape().notEmpty(),
    check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty(),
    check("instructionId", "El ID de la instrucción es obligatorio.").trim().escape().notEmpty(),
    check("score", "El puntaje es obligatorio.").isNumeric(),
    fieldsValidate,
  ],
  instructionController.gradeInstruction
);

// TODO: BORRAR ruta temporal para testear grading
router.get("/grade-test", instructionController.gradeTest);

module.exports = router;