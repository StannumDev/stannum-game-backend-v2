const { Router } = require("express");
const { check } = require("express-validator");
const { validateJWT } = require("../middlewares/validateJWT");
const { rateLimiter } = require("../middlewares/rateLimiter");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const userController = require("../controllers/userController");

const router = Router();

router.get(
    "/sidebar-details",
    [
        validateJWT,
        rateLimiter
    ],
    userController.getUserSidebarDetails
);

router.get(
    "/profile/:username",
    [
        rateLimiter,
    ],
    userController.getUserDetailsByUsername
);

router.get(
    "/tutorial/:tutorialName",
    [
        validateJWT,
        rateLimiter,
        check("tutorialName", "El nombre del tutorial es obligatorio y debe ser válido.").trim().escape().not().isEmpty().withMessage("El nombre del tutorial no puede estar vacío.").isLength({ min: 2, max: 50 }).withMessage("El nombre del tutorial debe tener entre 2 y 50 caracteres."),
        fieldsValidate,
    ],
    userController.getTutorialStatus
);

router.post(
    "/tutorial/:tutorialName/complete",
    [
        validateJWT,
        rateLimiter,
        check("tutorialName", "El nombre del tutorial es obligatorio y debe ser válido.").trim().escape().not().isEmpty().withMessage("El nombre del tutorial no puede estar vacío.").isLength({ min: 2, max: 50 }).withMessage("El nombre del tutorial debe tener entre 2 y 50 caracteres."),
        fieldsValidate,
    ],
    userController.markTutorialAsCompleted
);


module.exports = router;