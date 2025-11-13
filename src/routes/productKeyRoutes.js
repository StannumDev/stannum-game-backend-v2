const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { validateMakeAPIKey } = require("../middlewares/validateMakeAPIKey");
const productKeyController = require("../controllers/productKeyController");

const router = Router();

router.get(
  "/:code",
  [
    validateJWT,
    check("code", "El código de producto es obligatorio.").trim().escape().notEmpty().withMessage("El código no puede estar vacío.").matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/).withMessage("El código debe tener el formato XXXX-XXXX-XXXX-XXXX."),
    fieldsValidate,
  ],
  productKeyController.verifyProductKey
);

router.post(
  "/activate",
  [
    validateJWT,
    check("code", "El código de producto es obligatorio.").trim().notEmpty().withMessage("El código no puede estar vacío.").matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/).withMessage("El código debe tener el formato XXXX-XXXX-XXXX-XXXX."),
    fieldsValidate,
  ],
  productKeyController.activateProductKey
);

router.post(
  "/generate-and-send",
  [
    validateMakeAPIKey,
    check("email", "El email es obligatorio y debe ser válido.").trim().notEmpty().withMessage("El email no puede estar vacío.").isEmail().withMessage("El formato del email es inválido.").normalizeEmail(),
    check("fullName", "El nombre completo es obligatorio.").trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')).notEmpty().withMessage("El nombre no puede estar vacío.").isLength({ min: 2, max: 100 }).withMessage("El nombre debe tener entre 2 y 100 caracteres.").matches(/^[\p{L}\s]+$/u).withMessage("El nombre solo puede contener letras y espacios."),
    check("message", "El diagnóstico es obligatorio.").trim().notEmpty().withMessage("El diagnóstico no puede estar vacío.").isLength({ min: 10, max: 5000 }).withMessage("El diagnóstico debe tener entre 10 y 5000 caracteres."),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia"]).withMessage("El producto debe ser: tia"),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    fieldsValidate,
  ],
  productKeyController.generateAndSendProductKey
);

module.exports = router;