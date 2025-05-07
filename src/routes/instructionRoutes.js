const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
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
  "/submit/:programName/:instructionId",
  [
    validateJWT,
    check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty().withMessage("El nombre del programa no puede estar vacío."),
    check("instructionId", "El ID de la instrucción es obligatorio.").trim().escape().notEmpty().withMessage("El ID de la instrucción no puede estar vacío."),
    fieldsValidate,
  ],
  instructionController.submitInstruction
);

module.exports = router;