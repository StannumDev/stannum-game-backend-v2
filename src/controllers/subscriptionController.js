const User = require('../models/userModel');
const { getError } = require('../helpers/getError');
const {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  getPaymentHistory,
} = require('../services/subscriptionService');
const { getSubscriptionHealthStats } = require('../services/subscriptionReconciliationService');

// ─── Create subscription ────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { programId } = req.body;

    const user = await User.findById(userId).select('email');
    if (!user) return res.status(404).json(getError('AUTH_USER_NOT_FOUND'));

    const result = await createSubscription(userId, programId, user.email);

    return res.status(200).json({
      success: true,
      message: 'Redirigiendo a Mercado Pago...',
      ...result,
    });
  } catch (error) {
    if (error.statusCode && error.errorKey) {
      const response = getError(error.errorKey);
      if (error.mpMessage) response.mpMessage = error.mpMessage;
      return res.status(error.statusCode).json(response);
    }
    console.error('[Subscription] Error creating subscription:', error);
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

// ─── Cancel subscription ────────────────────────────────────────────────
const cancel = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { programId } = req.body;

    const result = await cancelSubscription(userId, programId, 'user');

    return res.status(200).json({
      success: true,
      message: 'Suscripción cancelada.',
      ...result,
    });
  } catch (error) {
    if (error.statusCode && error.errorKey) {
      return res.status(error.statusCode).json(getError(error.errorKey));
    }
    console.error('[Subscription] Error cancelling subscription:', error);
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

// ─── Get subscription status ────────────────────────────────────────────
const status = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { programId } = req.params;

    const result = await getSubscriptionStatus(userId, programId);

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode && error.errorKey) {
      return res.status(error.statusCode).json(getError(error.errorKey));
    }
    console.error('[Subscription] Error getting status:', error);
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

// ─── Get payment history ────────────────────────────────────────────────
const payments = async (req, res) => {
  try {
    const userId = req.userAuth.id;
    const { programId } = req.params;
    const page = parseInt(req.query.page) || 1;

    const result = await getPaymentHistory(userId, programId, page);

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[Subscription] Error getting payments:', error);
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

// ─── Health endpoint (admin) ─────────────────────────────────────────────
const health = async (req, res) => {
  try {
    const stats = await getSubscriptionHealthStats();
    return res.status(200).json({ success: true, ...stats });
  } catch (error) {
    console.error('[Subscription] Error getting health stats:', error);
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

// ─── Admin: cancel a subscription manually ──────────────────────────────
const adminCancel = async (req, res) => {
  try {
    const { userId, programId } = req.params;
    const result = await cancelSubscription(userId, programId, 'admin');
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode && error.errorKey) {
      return res.status(error.statusCode).json(getError(error.errorKey));
    }
    console.error('[Subscription Admin] Error cancelling:', error);
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

// ─── Admin: get subscription history ────────────────────────────────────
const adminHistory = async (req, res) => {
  try {
    const { userId, programId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const result = await getPaymentHistory(userId, programId, page);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[Subscription Admin] Error getting history:', error);
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

module.exports = {
  create,
  cancel,
  status,
  payments,
  health,
  adminCancel,
  adminHistory,
};
