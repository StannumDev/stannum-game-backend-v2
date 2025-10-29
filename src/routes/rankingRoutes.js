const { Router } = require("express");
const { check, query } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const rankingController = require("../controllers/rankingController");

const router = Router();

router.get(
    "/individual",
    [
        validateJWT,
        query("limit").optional().isInt({ min: 1, max: 1000 }).withMessage("El límite debe ser un número entre 1 y 1000."),
        fieldsValidate,
    ],
    rankingController.getIndividualRanking
);
  
router.get(
    "/team/:programName",
    [
        validateJWT,
        check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty().withMessage("El nombre del programa no puede estar vacío."),
        fieldsValidate,
    ],
    rankingController.getTeamRanking
);

// router.get(
//     "/individual/:programName",
//     [
//         validateJWT,
//         check("programName", "El nombre del programa es obligatorio.").trim().escape().notEmpty().withMessage("El nombre del programa no puede estar vacío."),
//         query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("El límite debe ser un número entre 1 y 100."),
//         fieldsValidate,
//     ],
//     rankingController.getIndividualRanking
// );

module.exports = router;