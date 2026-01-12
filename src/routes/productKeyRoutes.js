const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { validateAPIKey } = require("../middlewares/validateAPIKey");
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
    validateAPIKey,
    check("email", "El email es obligatorio y debe ser válido.").trim().notEmpty().withMessage("El email no puede estar vacío.").isEmail().withMessage("El formato del email es inválido.").normalizeEmail(),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tmd", "tia_summer"]).withMessage("El producto debe ser: TRENNO IA, TRENNO MARK DIGITAL, o TRENNO IA SUMMER."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    fieldsValidate,
  ],
  productKeyController.generateAndSendProductKey
);

router.post(
  "/generate-and-send-make",
  [
    validateAPIKey,
    check("email", "El email es obligatorio y debe ser válido.").trim().notEmpty().withMessage("El email no puede estar vacío.").isEmail().withMessage("El formato del email es inválido.").normalizeEmail(),
    check("fullName", "El nombre completo es obligatorio.").notEmpty().withMessage("El nombre no puede estar vacío.").isBase64().withMessage("El nombre debe estar codificado en Base64."),
    check("message", "El diagnóstico es obligatorio.").trim().notEmpty().withMessage("El diagnóstico no puede estar vacío.").isBase64().withMessage("El diagnóstico debe estar codificado en Base64."),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tia_summer"]).withMessage("El producto debe ser: TRENNO IA o TRENNO IA SUMMER."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    fieldsValidate,
  ],
  productKeyController.generateAndSendProductKeyMake
);

router.post(
  "/generate-and-send-make-summer",
  [
    validateAPIKey,
    check("email", "El email es obligatorio y debe ser válido.").trim().notEmpty().withMessage("El email no puede estar vacío.").isEmail().withMessage("El formato del email es inválido.").normalizeEmail(),
    check("fullName", "El nombre completo es obligatorio.").notEmpty().withMessage("El nombre no puede estar vacío.").isBase64().withMessage("El nombre debe estar codificado en Base64."),
    check("message", "El diagnóstico es obligatorio.").trim().notEmpty().withMessage("El diagnóstico no puede estar vacío.").isBase64().withMessage("El diagnóstico debe estar codificado en Base64."),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tia_summer"]).withMessage("El producto debe ser: TRENNO IA o TRENNO IA SUMMER."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    fieldsValidate,
  ],
  productKeyController.generateAndSendProductKeyMakeSummer
);

router.post(
  "/generate",
  [
    validateAPIKey,
    check("email", "El email es obligatorio y debe ser válido.").trim().notEmpty().withMessage("El email no puede estar vacío.").isEmail().withMessage("El formato del email es inválido.").normalizeEmail(),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tmd", "tia_summer"]).withMessage("El producto debe ser: TRENNO IA, TRENNO MARK DIGITAL, o TRENNO IA SUMMER."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    fieldsValidate,
  ],
  productKeyController.generateProductKey
);

module.exports = router;