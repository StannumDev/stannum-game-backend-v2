const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
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
        check("code", "El código de producto es obligatorio.").trim().escape().notEmpty().withMessage("El código no puede estar vacío.").matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/).withMessage("El código debe tener el formato XXXX-XXXX-XXXX-XXXX."),
        fieldsValidate,
    ],
    productKeyController.activateProductKey
);

module.exports = router;