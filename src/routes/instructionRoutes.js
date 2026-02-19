const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { submissionLimiter } = require("../middlewares/rateLimiter");
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
    submissionLimiter,
    check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty().withMessage("El nombre del programa no puede estar vacío."),
    check("instructionId", "El ID de la instrucción es obligatorio.").trim().escape().notEmpty().withMessage("El ID de la instrucción no puede estar vacío."),
    check("s3Key").optional().trim().isLength({ max: 500 }).withMessage("La clave S3 no puede exceder 500 caracteres."),
    check("submittedText").optional().trim().isLength({ max: 10000 }).withMessage("El texto enviado no puede exceder 10000 caracteres."),
    fieldsValidate,
  ],
  instructionController.submitInstruction
);

router.post(
  "/retry/:programName/:instructionId",
  [
    validateJWT,
    check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty(),
    check("instructionId", "El ID de la instrucción es obligatorio.").trim().escape().notEmpty(),
    fieldsValidate,
  ],
  instructionController.retryGrading
);

module.exports = router;