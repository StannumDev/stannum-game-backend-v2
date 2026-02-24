const { Router } = require('express');
const { validateJWT } = require('../middlewares/validateJWT');
const { sensitiveOperationLimiter } = require('../middlewares/rateLimiter');
const chestController = require('../controllers/chestController');

const router = Router();

router.post(
    '/:programId/:chestId/open',
    [validateJWT, sensitiveOperationLimiter],
    chestController.openChest
);

module.exports = router;
