const { Router } = require("express");
const { check } = require("express-validator");
const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const userController = require("../controllers/userController");

const router = Router();

router.get(
    "/sidebar-details",
    validateJWT,
    userController.getUserSidebarDetails
);

router.get(
    "/profile/:username",
    validateJWT,
    userController.getUserDetailsByUsername
);

router.get(
    "/tutorial/:tutorialName",
    [
        validateJWT,
        check("tutorialName", "El nombre del tutorial es obligatorio y debe ser válido.").trim().escape().not().isEmpty().withMessage("El nombre del tutorial no puede estar vacío.").isLength({ min: 2, max: 50 }).withMessage("El nombre del tutorial debe tener entre 2 y 50 caracteres."),
        fieldsValidate,
    ],
    userController.getTutorialStatus
);

router.post(
    "/tutorial/:tutorialName/complete",
    [
        validateJWT,
        check("tutorialName", "El nombre del tutorial es obligatorio y debe ser válido.").trim().escape().not().isEmpty().withMessage("El nombre del tutorial no puede estar vacío.").isLength({ min: 2, max: 50 }).withMessage("El nombre del tutorial debe tener entre 2 y 50 caracteres."),
        fieldsValidate,
    ],
    userController.markTutorialAsCompleted
);

router.put(
    "/edit",
    [
        validateJWT,
        check("name", "El nombre debe tener entre 2 y 50 caracteres.").optional().trim().escape().isLength({ min: 2, max: 50 }).withMessage("El nombre debe tener entre 2 y 50 caracteres.").matches(/^[\p{L}\s]+$/u).withMessage("El nombre solo puede contener letras y espacios."),
        check("birthdate", "Fecha de nacimiento no válida.").optional().isISO8601().withMessage("La fecha de nacimiento debe estar en formato ISO8601 (YYYY-MM-DD).")
            .custom((value) => {
                const today = new Date();
                const birthDate = new Date(value);
                const age = today.getFullYear() - birthDate.getFullYear();
                if (age < 18) throw new Error("Debes tener al menos 18 años.");
                if (birthDate > today) throw new Error("La fecha de nacimiento no puede ser en el futuro.");
                return true;
            }),
        check("country", "El país es requerido.").optional().trim().escape().isLength({ min: 2, max: 50 }).withMessage("El país debe tener entre 2 y 50 caracteres."),
        check("region", "La región es requerida.").optional().trim().escape().isLength({ min: 2, max: 50 }).withMessage("La región debe tener entre 2 y 50 caracteres."),
        check("enterprise", "La empresa debe tener máximo 100 caracteres.").optional().trim().escape().isLength({ max: 100 }).withMessage("La empresa debe tener menos de 100 caracteres."),
        check("enterpriseRole", "El puesto debe tener máximo 50 caracteres.").optional().trim().escape().isLength({ max: 50 }).withMessage("El puesto debe tener menos de 50 caracteres."),
        check("aboutme", "El campo 'sobre mí' debe tener menos de 2600 caracteres.").optional().trim().escape().isLength({ max: 2600 }).withMessage("El campo 'sobre mí' debe tener menos de 2600 caracteres."),
        fieldsValidate,
    ],
    userController.editUser
);

module.exports = router;