const { Router } = require("express");
const { check, param } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { validateAPIKey } = require("../middlewares/validateAPIKey");
const productKeyController = require("../controllers/productKeyController");

const router = Router();

// Progreso del usuario (API key) — consumido por el Trenno Dashboard.
// Antes de "/:code" para que la ruta de dos segmentos no caiga en el matcher de código.
router.get(
  "/user-progress/:email",
  [
    validateAPIKey,
    param("email", "Email inválido").isEmail(),
    fieldsValidate,
  ],
  productKeyController.userProgress
);

router.get(
  "/:code",
  [
    validateJWT,
    param("code", "El código de producto es obligatorio.").trim().notEmpty().withMessage("El código no puede estar vacío.").matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/).withMessage("El código debe tener el formato XXXX-XXXX-XXXX-XXXX."),
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
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tmd", "tia_summer", "tia_pool"]).withMessage("El producto debe ser: TRENNO IA, TRENNO MARK DIGITAL, TRENNO IA SUMMER o TRENNO IA POOL."),
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
    check("message", "El diagnóstico debe estar codificado en Base64.").optional().trim().isBase64().withMessage("El diagnóstico debe estar codificado en Base64."),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tia_summer", "tia_pool"]).withMessage("El producto debe ser: TRENNO IA, TRENNO IA SUMMER o TRENNO IA POOL."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    check("guideLink", "El link de la guía debe ser una URL válida.").optional().trim().isURL().withMessage("El formato del link de la guía es inválido."),
    check("whatsappLink", "El link de WhatsApp debe ser una URL válida.").optional().trim().isURL().withMessage("El formato del link de WhatsApp es inválido."),
    fieldsValidate,
  ],
  productKeyController.generateAndSendProductKeyMake
);

router.post(
  "/generate",
  [
    validateAPIKey,
    check("email", "El email es obligatorio y debe ser válido.").trim().notEmpty().withMessage("El email no puede estar vacío.").isEmail().withMessage("El formato del email es inválido.").normalizeEmail(),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tmd", "tia_summer", "tia_pool"]).withMessage("El producto debe ser: TRENNO IA, TRENNO MARK DIGITAL, TRENNO IA SUMMER o TRENNO IA POOL."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    fieldsValidate,
  ],
  productKeyController.generateProductKey
);

router.post(
  "/auto-enroll",
  [
    validateAPIKey,
    check("email", "El email es obligatorio y debe ser válido.").trim().notEmpty().withMessage("El email no puede estar vacío.").isEmail().withMessage("El formato del email es inválido.").normalizeEmail(),
    check("fullName", "El nombre completo es obligatorio.").notEmpty().withMessage("El nombre no puede estar vacío.").isBase64().withMessage("El nombre debe estar codificado en Base64."),
    check("message", "El diagnóstico debe estar codificado en Base64.").optional().trim().isBase64().withMessage("El diagnóstico debe estar codificado en Base64."),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tmd", "tia_summer", "tia_pool"]).withMessage("El producto debe ser: TRENNO IA, TRENNO MARK DIGITAL, TRENNO IA SUMMER o TRENNO IA POOL."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    check("guideLink", "El link de la guía debe ser una URL válida.").optional().trim().isURL().withMessage("El formato del link de la guía es inválido."),
    check("whatsappLink", "El link de WhatsApp debe ser una URL válida.").optional().trim().isURL().withMessage("El formato del link de WhatsApp es inválido."),
    fieldsValidate,
  ],
  productKeyController.autoEnroll
);

router.post(
  "/generate-and-send-bulk",
  [
    validateAPIKey,
    check("emails", "El array de emails es obligatorio.").isArray({ min: 1, max: 100 }).withMessage("Debe enviar entre 1 y 100 emails."),
    check("emails.*", "Cada email debe ser válido.").isEmail().withMessage("El formato de algún email es inválido."),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tmd", "tia_summer", "tia_pool"]).withMessage("El producto debe ser: TRENNO IA, TRENNO MARK DIGITAL, TRENNO IA SUMMER o TRENNO IA POOL."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    fieldsValidate,
  ],
  productKeyController.generateAndSendBulk
);

router.post(
  "/auto-enroll-bulk",
  [
    validateAPIKey,
    check("emails", "El array de emails es obligatorio.").isArray({ min: 1, max: 100 }).withMessage("Debe enviar entre 1 y 100 emails."),
    check("emails.*", "Cada email debe ser válido.").isEmail().withMessage("El formato de algún email es inválido."),
    check("product", "El producto debe ser un string válido.").optional().trim().isIn(["tia", "tmd", "tia_summer", "tia_pool"]).withMessage("El producto debe ser: TRENNO IA, TRENNO MARK DIGITAL, TRENNO IA SUMMER o TRENNO IA POOL."),
    check("team", "El equipo debe ser un string válido.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')),
    fieldsValidate,
  ],
  productKeyController.autoEnrollBulk
);

router.get(
  "/check/:code",
  [
    validateAPIKey,
    param("code", "El código de producto es obligatorio.").trim().notEmpty().withMessage("El código no puede estar vacío."),
    fieldsValidate,
  ],
  productKeyController.checkProductKeyStatus
);

module.exports = router;