const { Router } = require('express');
const { check } = require('express-validator');

const { validateJWT } = require('../middlewares/validateJWT');
const { isAdmin } = require('../middlewares/isAdmin');
const { fieldsValidate } = require('../middlewares/fieldsValidate');
const { paymentLimiter, sensitiveOperationLimiter } = require('../middlewares/rateLimiter');
const subscriptionController = require('../controllers/subscriptionController');

const router = Router();

// Create subscription (redirect mode — returns MP init_point URL)
router.post(
  '/create',
  [
    validateJWT,
    paymentLimiter,
    check('programId', 'El programa es obligatorio.').trim().notEmpty(),
    fieldsValidate,
  ],
  subscriptionController.create
);

// Cancel subscription (logged-in user)
router.post(
  '/cancel',
  [
    validateJWT,
    sensitiveOperationLimiter,
    check('programId', 'El programa es obligatorio.').trim().notEmpty(),
    fieldsValidate,
  ],
  subscriptionController.cancel
);

// Get subscription status for a program
router.get(
  '/status/:programId',
  [validateJWT],
  subscriptionController.status
);

// Get payment history for a program
router.get(
  '/payments/:programId',
  [validateJWT],
  subscriptionController.payments
);

// Download subscription payment receipt
router.get(
  '/payment/:paymentId/receipt',
  [
    validateJWT,
    sensitiveOperationLimiter,
    check('paymentId', 'ID de pago inválido.').isMongoId(),
    fieldsValidate,
  ],
  subscriptionController.downloadReceipt
);

// ─── Admin routes ──────────────────────────────────────────────────────

// Health stats
router.get(
  '/health',
  [validateJWT, isAdmin],
  subscriptionController.health
);

// Admin: cancel subscription for a user
router.post(
  '/admin/:userId/:programId/cancel',
  [validateJWT, isAdmin],
  subscriptionController.adminCancel
);

// Admin: view payment history for a user
router.get(
  '/admin/:userId/:programId/history',
  [validateJWT, isAdmin],
  subscriptionController.adminHistory
);

module.exports = router;
