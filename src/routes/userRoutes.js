const { Router } = require("express");
const { check } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { searchRateLimiter } = require("../middlewares/rateLimiter");
const userController = require("../controllers/userController");

const router = Router();

router.get(
    "/",
    validateJWT,
    userController.getUserByToken
);

router.get(
    "/sidebar-details",
    validateJWT,
    userController.getUserSidebarDetails
);

router.get(
    "/profile/:username",
    [
        validateJWT,
        check("username", "El nombre de usuario es inválido.").trim().escape().customSanitizer(value => value.replace(/\s+/g, ' ')).not().isEmpty().withMessage("El nombre de usuario no puede estar vacío.").isLength({ min: 6, max: 25 }).withMessage("El nombre de usuario debe tener entre 6 y 25 caracteres.").matches(/^[a-zA-Z0-9._]+$/).withMessage("El nombre de usuario solo puede contener letras minúsculas, números, puntos y guiones bajos."),
        fieldsValidate,
    ],
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
        check("name", "El nombre debe tener entre 2 y 50 caracteres.").optional().trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')).isLength({ min: 2, max: 50 }).withMessage("El nombre debe tener entre 2 y 50 caracteres.").matches(/^[\p{L}\s]+$/u).withMessage("El nombre solo puede contener letras y espacios."),
        check("birthdate", "Birthdate is required.").trim().escape().not().isEmpty().withMessage("Birthdate cannot be empty.")
            .custom((value) => {
                const today = new Date();
                const birthDate = new Date(value);
                const age = today.getFullYear() - birthDate.getFullYear();
                if (age < 18) throw new Error("You must be at least 18 years old.");
                if (birthDate > today) throw new Error("Birthdate cannot be in the future.");
                return true;
            }
        ),
        check("country", "Country is required.").trim().escape().not().isEmpty().withMessage("Country cannot be empty."),
        check("region", "Region is required.").trim().escape().not().isEmpty().withMessage("Region cannot be empty."),
        check("enterprise", "Enterprise is required.").trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')).not().isEmpty().withMessage("Enterprise cannot be empty.").isLength({ max: 100 }).withMessage("Enterprise must be less than 100 characters."),
        check("enterpriseRole", "Enterprise role is required.").trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')).not().isEmpty().withMessage("Enterprise role cannot be empty.").isLength({ max: 50 }).withMessage("Enterprise role must be less than 50 characters."),
        check("aboutme", "About me is required.").trim().customSanitizer(value => value.replace(/<[^>]*>?/gm, '')).customSanitizer(value => value.replace(/\s+/g, ' ')).not().isEmpty().withMessage("About me cannot be empty.").isLength({ max: 2600 }).withMessage("About me must be less than 2600 characters."),
        check("socialLinks", "Social links must be an array.").optional().isArray().withMessage("Social links must be an array."),
        check("socialLinks.*.platform", "Platform is required and must be valid.").optional().trim().isIn(["LinkedIn", "Instagram", "Twitter", "TikTok", "Facebook", "YouTube", "Website", "Otra"]).withMessage("Platform must be one of: LinkedIn, Instagram, Twitter, TikTok, Facebook, YouTube, Website, Otra."),
        check("socialLinks.*.url", "URL is required and must be valid.").optional().trim().isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage("URL must be a valid URL starting with http:// or https://.").isLength({ max: 500 }).withMessage("URL must be less than 500 characters."),
        fieldsValidate,
    ],
    userController.editUser
);

router.get(
    "/search-users",
    [
        validateJWT,
        check("query", "Search query is required.").trim().escape().not().isEmpty().withMessage("Search query cannot be empty.").isLength({ min: 2 }).withMessage("Search query must be at least 2 characters long."),
        fieldsValidate,
    ],
    searchRateLimiter,
    userController.searchUsers
);

module.exports = router;