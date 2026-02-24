const { Router } = require('express');
const { check } = require('express-validator');

const { validateJWT } = require('../middlewares/validateJWT');
const { fieldsValidate } = require('../middlewares/fieldsValidate');
const { sensitiveOperationLimiter } = require('../middlewares/rateLimiter');
const storeController = require('../controllers/storeController');

const router = Router();

router.get(
    '/covers',
    [validateJWT],
    storeController.getCovers
);

router.post(
    '/covers/purchase',
    [
        validateJWT,
        sensitiveOperationLimiter,
        check('coverId', 'El ID de la portada es obligatorio.').trim().notEmpty(),
        fieldsValidate,
    ],
    storeController.purchaseCover
);

router.put(
    '/covers/equip',
    [
        validateJWT,
        sensitiveOperationLimiter,
        check('coverId', 'El ID de la portada es obligatorio.').trim().notEmpty(),
        fieldsValidate,
    ],
    storeController.equipCover
);

module.exports = router;
