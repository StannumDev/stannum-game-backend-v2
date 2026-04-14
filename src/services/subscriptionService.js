const axios = require('axios');
const User = require('../models/userModel');
const SubscriptionPayment = require('../models/subscriptionPaymentModel');
const SubscriptionAuditLog = require('../models/subscriptionAuditLogModel');
const { hasAccess } = require('../utils/accessControl');
const { isSubscriptionProgram, isValidProgram, SUBSCRIPTION_PROGRAMS } = require('../config/programRegistry');
const programPricing = require('../config/programPricing');
const {
  sendSubscriptionActivatedEmail,
  sendPaymentSuccessEmail,
  sendPaymentRejectedEmail,
  sendCancellationConfirmEmail,
  sendSubscriptionExpiredEmail,
} = require('./subscriptionEmailService');
const { generateSubscriptionReceipt } = require('./receiptService');
const { transferDemoProgress } = require('./demoTransferService');

const MP_API = 'https://api.mercadopago.com';

const mpHeaders = () => ({
  Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
});

// ─── Dynamic query builder for subscription programs ────────────────────
// Reads from SUBSCRIPTION_PROGRAMS (programRegistry.js) — adding a new
// subscription program there is the ONLY change needed for queries to work.
function buildSubscriptionQuery(field, value) {
  return SUBSCRIPTION_PROGRAMS.map(pid => ({ [`programs.${pid}.subscription.${field}`]: value }));
}

function buildSubscriptionFindQuery(conditions) {
  // conditions = [{ field: 'mpSubscriptionId', value: id }, ...]
  // Returns $or across all subscription programs for each condition set
  const orClauses = [];
  for (const cond of conditions) {
    for (const pid of SUBSCRIPTION_PROGRAMS) {
      const clause = {};
      for (const [field, value] of Object.entries(cond)) {
        clause[`programs.${pid}.subscription.${field}`] = value;
      }
      orClauses.push(clause);
    }
  }
  return { $or: orClauses };
}

// ─── Safe +1 month date arithmetic (MED-06 + HIGH-01 fix) ──────────────
// Uses UTC methods to avoid clock skew issues on servers in non-UTC timezones.
function addOneMonth(date) {
  const d = new Date(date);
  const originalDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  // If day overflowed (e.g. Jan 31 → Mar 3), clamp to last day of target month
  if (d.getUTCDate() !== originalDay) {
    d.setUTCDate(0); // sets to last day of previous month (= target month)
  }
  return d;
}

// ─── Valid state transitions ────────────────────────────────────────────
const VALID_TRANSITIONS = {
  null: ['pending', 'active'],
  pending: ['active', 'cancelled'],
  active: ['paused', 'cancelled'],
  paused: ['active', 'cancelled'],
  cancelled: ['expired'],
  expired: ['pending', 'active'], // re-subscription
};

function isValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ─── Update hasAccessFlag ───────────────────────────────────────────────
async function updateHasAccessFlag(user, programId) {
  const program = user.programs?.[programId];
  if (!program) return;
  const newFlag = hasAccess(program);
  if (program.hasAccessFlag !== newFlag) {
    await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { [`programs.${programId}.hasAccessFlag`]: newFlag } }
    );
    program.hasAccessFlag = newFlag;
  }
}

// ─── Audit log helper ───────────────────────────────────────────────────
// LOW-02 fix: accept mpSubscriptionId and priceARS directly to avoid stale re-reads
async function logAudit(userId, programId, previousStatus, newStatus, trigger, metadata = {}) {
  try {
    const mpSubId = metadata.mpSubscriptionId || metadata.mpPreapprovalId || null;
    const priceARS = metadata.priceARS || null;

    await SubscriptionAuditLog.create({
      userId,
      programId,
      mpSubscriptionId: mpSubId,
      previousStatus,
      newStatus,
      priceARS,
      trigger,
      metadata,
    });
  } catch (err) {
    // Audit log failure should never block the main operation
    console.error(`[AuditLog] Failed to log ${previousStatus}→${newStatus} for user ${userId}:`, err.message);
  }
}

// ─── Create subscription (redirect mode) ────────────────────────────────
// Creates a pending preapproval in MP and returns init_point for user redirect.
// Activation happens via webhook when user authorizes on MP.
async function createSubscription(userId, programId, payerEmail) {
  if (!isSubscriptionProgram(programId)) {
    throw { statusCode: 400, errorKey: 'SUBSCRIPTION_INVALID_PROGRAM' };
  }

  const pricing = programPricing[programId];
  if (!pricing || !pricing.purchasable || pricing.type !== 'subscription') {
    throw { statusCode: 400, errorKey: 'SUBSCRIPTION_NOT_AVAILABLE' };
  }

  // Ensure the program entry exists in the user's document
  await User.findOneAndUpdate(
    { _id: userId, [`programs.${programId}`]: { $exists: false } },
    { $set: { [`programs.${programId}`]: { subscription: {} } } }
  );

  // Atomic lock — set status to 'pending' to prevent concurrent creates.
  const now = new Date();
  const lockResult = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { [`programs.${programId}.subscription.status`]: null },
        { [`programs.${programId}.subscription.status`]: { $exists: false } },
        { [`programs.${programId}.subscription.status`]: 'expired' },
        {
          [`programs.${programId}.subscription.status`]: 'pending',
          [`programs.${programId}.subscription.pendingExpiresAt`]: { $lte: now },
        },
      ],
      [`programs.${programId}.hasAccessFlag`]: { $ne: true },
    },
    {
      $set: {
        [`programs.${programId}.subscription.status`]: 'pending',
        [`programs.${programId}.subscription.pendingExpiresAt`]: new Date(now.getTime() + 30 * 60 * 1000), // 30min lock (user needs time on MP)
      },
    },
    { new: true }
  );

  if (!lockResult) {
    const user = await User.findById(userId).select(`programs.${programId}`).lean();
    if (!user) throw { statusCode: 404, errorKey: 'AUTH_USER_NOT_FOUND' };
    const userProgram = user.programs?.[programId];
    if (hasAccess(userProgram)) throw { statusCode: 400, errorKey: 'SUBSCRIPTION_ALREADY_ACTIVE' };
    if (userProgram?.subscription?.status === 'pending') throw { statusCode: 400, errorKey: 'SUBSCRIPTION_PENDING_EXISTS' };
    if (['active', 'paused', 'cancelled'].includes(userProgram?.subscription?.status)) throw { statusCode: 400, errorKey: 'SUBSCRIPTION_ALREADY_ACTIVE' };
    throw { statusCode: 400, errorKey: 'SUBSCRIPTION_ALREADY_ACTIVE' };
  }

  const price = pricing.currentMonthlyPriceARS;
  const frontendUrl = process.env.FRONTEND_URL || 'https://stannumgame.com';
  const externalRef = `${userId}_${programId}`;

  // Create standalone preapproval in MP (no plan required) — user will authorize on MP
  const preapprovalBody = {
    reason: pricing.name || programId,
    payer_email: payerEmail,
    external_reference: externalRef,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: price,
      currency_id: 'ARS',
    },
    back_url: `${frontendUrl}/dashboard/subscription/result?programId=${programId}`,
    status: 'pending',
  };

  let mpResponse;
  try {
    const { data } = await axios.post(`${MP_API}/preapproval`, preapprovalBody, {
      headers: mpHeaders(),
      timeout: 15000,
    });
    mpResponse = data;
  } catch (err) {
    // MP call failed — release the lock
    await User.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          [`programs.${programId}.subscription.status`]: null,
          [`programs.${programId}.subscription.pendingExpiresAt`]: null,
        },
      }
    );
    const mpError = err.response?.data;
    console.error('[Subscription] MP create error:', mpError || err.message);
    throw {
      statusCode: 502,
      errorKey: 'SUBSCRIPTION_MP_ERROR',
      mpMessage: mpError?.message || err.message,
    };
  }

  // Save MP subscription ID — status stays "pending" until webhook confirms
  const oldMpSubId = lockResult.programs?.[programId]?.subscription?.mpSubscriptionId;
  let previousSubIds = lockResult.programs?.[programId]?.subscription?.previousSubscriptionIds || [];
  if (oldMpSubId && oldMpSubId !== mpResponse.id) {
    previousSubIds = [...previousSubIds, oldMpSubId].slice(-5); // cap to last 5
    // Cancel old preapproval on MP to prevent orphans (best-effort, don't block on failure)
    try {
      await axios.put(`${MP_API}/preapproval/${oldMpSubId}`, { status: 'cancelled' }, { headers: mpHeaders(), timeout: 10000 });
      console.info(`[Subscription] Cancelled old MP preapproval ${oldMpSubId} for user ${userId}`);
    } catch (cancelErr) {
      console.error(`[Subscription] Failed to cancel old MP preapproval ${oldMpSubId}:`, cancelErr.message);
    }
  }

  try {
    await User.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          [`programs.${programId}.subscription.mpSubscriptionId`]: mpResponse.id,
          [`programs.${programId}.subscription.priceARS`]: price,
          [`programs.${programId}.subscription.pendingExpiresAt`]: new Date(now.getTime() + 30 * 60 * 1000),
          [`programs.${programId}.subscription.previousSubscriptionIds`]: previousSubIds,
        },
      }
    );
  } catch (saveErr) {
    console.error('[Subscription] DB save failed, cancelling orphaned MP preapproval:', saveErr.message);
    let mpCancelled = false;
    try {
      await axios.put(`${MP_API}/preapproval/${mpResponse.id}`, { status: 'cancelled' }, { headers: mpHeaders(), timeout: 10000 });
      mpCancelled = true;
    } catch (cancelErr) {
      console.error('[Subscription] CRITICAL: Failed to cancel orphaned MP preapproval:', mpResponse.id, cancelErr.message);
    }

    // Reset user status so they can retry
    await User.findOneAndUpdate(
      { _id: userId },
      { $set: {
        [`programs.${programId}.subscription.status`]: null,
        [`programs.${programId}.subscription.pendingExpiresAt`]: null,
      } }
    ).catch(() => {});

    // Log orphan for manual cleanup if MP cancel also failed
    if (!mpCancelled) {
      await logAudit(userId, programId, 'pending', 'pending', 'system', {
        reason: 'orphaned_mp_preapproval',
        mpPreapprovalId: mpResponse.id,
        error: saveErr.message,
      });
    }

    throw { statusCode: 500, errorKey: 'SERVER_INTERNAL_ERROR' };
  }

  await logAudit(userId, programId, null, 'pending', 'user', {
    mpPreapprovalId: mpResponse.id,
    priceARS: price,
  });

  return {
    success: true,
    initPoint: mpResponse.init_point,
    subscriptionId: mpResponse.id,
    priceARS: price,
    status: 'pending',
  };
}

// ─── Cancel subscription ────────────────────────────────────────────────
async function cancelSubscription(userId, programId, trigger = 'user') {
  const user = await User.findById(userId);
  if (!user) throw { statusCode: 404, errorKey: 'AUTH_USER_NOT_FOUND' };

  const userProgram = user.programs?.[programId];
  if (!userProgram) throw { statusCode: 404, errorKey: 'VALIDATION_PROGRAM_NOT_FOUND' };

  const sub = userProgram.subscription;
  if (!sub?.mpSubscriptionId) {
    throw { statusCode: 400, errorKey: 'SUBSCRIPTION_NOT_FOUND' };
  }

  if (!isValidTransition(sub.status, 'cancelled')) {
    throw { statusCode: 400, errorKey: 'SUBSCRIPTION_CANNOT_CANCEL' };
  }

  // Cancel in MP
  try {
    await axios.put(
      `${MP_API}/preapproval/${sub.mpSubscriptionId}`,
      { status: 'cancelled' },
      { headers: mpHeaders(), timeout: 10000 }
    );
  } catch (err) {
    console.error('[Subscription] MP cancel error:', err.response?.data || err.message);
    throw { statusCode: 502, errorKey: 'SUBSCRIPTION_MP_ERROR' };
  }

  const previousStatus = sub.status;
  const now = new Date();

  // Use findOneAndUpdate for atomicity instead of read-modify-save
  await User.findOneAndUpdate(
    { _id: userId },
    {
      $set: {
        [`programs.${programId}.subscription.status`]: 'cancelled',
        [`programs.${programId}.subscription.cancelledAt`]: now,
        [`programs.${programId}.subscription.lastWebhookAt`]: now,
      },
    }
  );

  // hasAccessFlag stays true if still in paid period
  // Re-read user to get updated state for hasAccess calculation
  const updatedUser = await User.findById(userId);
  if (updatedUser) await updateHasAccessFlag(updatedUser, programId);

  await logAudit(userId, programId, previousStatus, 'cancelled', trigger, {
    mpSubscriptionId: sub.mpSubscriptionId,
  });

  // Send cancellation confirmation email
  const cancelProgramName = programPricing[programId]?.name || programId;
  sendCancellationConfirmEmail(user.email, cancelProgramName, sub.currentPeriodEnd);

  return {
    success: true,
    status: 'cancelled',
    accessUntil: sub.currentPeriodEnd,
  };
}

// ─── Get subscription status ────────────────────────────────────────────
async function getSubscriptionStatus(userId, programId) {
  // CRIT-04 fix: Validate programId to prevent MongoDB injection via dynamic field paths
  if (!isValidProgram(programId)) {
    throw { statusCode: 400, errorKey: 'SUBSCRIPTION_INVALID_PROGRAM' };
  }

  const user = await User.findById(userId)
    .select(`programs.${programId} email`)
    .lean();
  if (!user) throw { statusCode: 404, errorKey: 'AUTH_USER_NOT_FOUND' };

  const userProgram = user.programs?.[programId];
  if (!userProgram) throw { statusCode: 404, errorKey: 'VALIDATION_PROGRAM_NOT_FOUND' };

  const sub = userProgram.subscription;
  const pricing = programPricing[programId];

  return {
    status: sub?.status || null,
    priceARS: sub?.priceARS || null,
    currentPeriodEnd: sub?.currentPeriodEnd || null,
    subscribedAt: sub?.subscribedAt || null,
    cancelledAt: sub?.cancelledAt || null,
    lastPaymentAt: sub?.lastPaymentAt || null,
    hasAccess: hasAccess(userProgram),
    currentMonthlyPriceARS: pricing?.currentMonthlyPriceARS || null,
    isPriceGrandfathered: sub?.priceARS && pricing?.currentMonthlyPriceARS
      ? sub.priceARS < pricing.currentMonthlyPriceARS
      : false,
  };
}

// ─── Get payment history ────────────────────────────────────────────────
async function getPaymentHistory(userId, programId, page = 1, limit = 20) {
  // CRIT-04 fix: Validate programId
  if (!isValidProgram(programId)) {
    throw { statusCode: 400, errorKey: 'SUBSCRIPTION_INVALID_PROGRAM' };
  }

  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    SubscriptionPayment.find({ userId, programId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SubscriptionPayment.countDocuments({ userId, programId }),
  ]);

  return {
    payments: payments.map(p => ({
      id: p._id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      retryAttempt: p.retryAttempt,
      receiptNumber: p.receiptNumber || null,
      date: p.createdAt,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

// ─── Process subscription webhook (preapproval status change) ───────────
async function processPreapprovalWebhook(preapprovalId) {
  // Fetch current state from MP
  let mpData;
  try {
    const { data } = await axios.get(`${MP_API}/preapproval/${preapprovalId}`, {
      headers: mpHeaders(),
      timeout: 10000,
    });
    mpData = data;
  } catch (err) {
    console.error('[Subscription Webhook] Failed to fetch preapproval:', err.message);
    return;
  }

  // CRIT-01 fix: Dynamic query across all subscription programs
  const user = await User.findOne(
    buildSubscriptionFindQuery([
      { mpSubscriptionId: preapprovalId },
      { previousSubscriptionIds: preapprovalId },
    ])
  );

  if (!user) {
    console.warn(`[Subscription Webhook] No user found for preapproval ${preapprovalId}`);
    return;
  }

  // Find which program this subscription belongs to
  let programId = null;
  for (const [pid, prog] of Object.entries(user.programs?.toJSON?.() || user.programs || {})) {
    if (prog?.subscription?.mpSubscriptionId === preapprovalId) {
      programId = pid;
      break;
    }
    if (prog?.subscription?.previousSubscriptionIds?.includes(preapprovalId)) {
      // Old subscription ID — just log and ignore
      console.info(`[Subscription Webhook] Ignoring webhook for old subscription ${preapprovalId}`);
      return;
    }
  }

  if (!programId) {
    console.warn(`[Subscription Webhook] Could not determine programId for preapproval ${preapprovalId}`);
    return;
  }

  const userProgram = user.programs[programId];
  const sub = userProgram.subscription;
  const previousStatus = sub.status;

  // Map MP status to our status
  const mpStatusMap = {
    authorized: 'active',
    paused: 'paused',
    cancelled: 'cancelled',
  };

  const newStatus = mpStatusMap[mpData.status] || null;
  if (!newStatus) {
    console.warn(`[Subscription Webhook] Unknown MP status: ${mpData.status}`);
    return;
  }

  // Skip if already in this state
  if (previousStatus === newStatus) {
    await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { [`programs.${programId}.subscription.lastWebhookAt`]: new Date() } }
    );
    return;
  }

  // Validate transition
  if (!isValidTransition(previousStatus, newStatus)) {
    console.warn(`[Subscription Webhook] Invalid transition: ${previousStatus} → ${newStatus} for user ${user._id}`);
    return;
  }

  const now = new Date();
  const updateFields = {
    [`programs.${programId}.subscription.status`]: newStatus,
    [`programs.${programId}.subscription.lastWebhookAt`]: now,
  };

  if (newStatus === 'cancelled' && !sub.cancelledAt) {
    updateFields[`programs.${programId}.subscription.cancelledAt`] = now;
  }

  // Activation: pending → active (user authorized on MP)
  if (previousStatus === 'pending' && newStatus === 'active') {
    updateFields[`programs.${programId}.subscription.subscribedAt`] = sub.subscribedAt || now;
    updateFields[`programs.${programId}.subscription.cancelledAt`] = null;
    updateFields[`programs.${programId}.subscription.pendingExpiresAt`] = null;
    updateFields[`programs.${programId}.subscription.currentPeriodEnd`] = addOneMonth(now);
    updateFields[`programs.${programId}.hasAccessFlag`] = true;
    updateFields[`programs.${programId}.acquiredAt`] = userProgram.acquiredAt || now;
  }

  await User.findOneAndUpdate({ _id: user._id }, { $set: updateFields });

  // Re-read for hasAccess calculation (unless we just set it above)
  if (!(previousStatus === 'pending' && newStatus === 'active')) {
    const updatedUser = await User.findById(user._id);
    if (updatedUser) await updateHasAccessFlag(updatedUser, programId);
  }

  await logAudit(user._id, programId, previousStatus, newStatus, 'webhook', {
    mpPreapprovalId: preapprovalId,
    mpSubscriptionId: sub.mpSubscriptionId,
    mpStatus: mpData.status,
  });

  // Post-activation tasks (pending → active)
  if (previousStatus === 'pending' && newStatus === 'active') {
    // Send activation email
    const pricingName = programPricing[programId]?.name || programId;
    const price = sub.priceARS || programPricing[programId]?.currentMonthlyPriceARS;
    if (user.email) sendSubscriptionActivatedEmail(user.email, pricingName, price);

    // Transfer demo progress
    try {
      const transferResult = await transferDemoProgress(user._id, programId);
      if (transferResult.transferred) {
        console.info(`[Subscription Webhook] Demo progress transferred for user ${user._id}`);
      }
    } catch (err) {
      console.error('[Subscription Webhook] Demo transfer failed, flagging for retry:', err.message);
      await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { [`programs.${programId}.demoTransferPending`]: true } }
      ).catch(() => {});
    }
  }
}

// ─── Process authorized payment webhook ─────────────────────────────────
async function processAuthorizedPaymentWebhook(authorizedPaymentId) {
  let mpData;
  try {
    const { data } = await axios.get(`${MP_API}/authorized_payments/${authorizedPaymentId}`, {
      headers: mpHeaders(),
      timeout: 10000,
    });
    mpData = data;
  } catch (err) {
    console.error('[Subscription Webhook] Failed to fetch authorized_payment:', err.message);
    return;
  }

  const preapprovalId = mpData.preapproval_id;
  if (!preapprovalId) {
    console.warn('[Subscription Webhook] authorized_payment missing preapproval_id');
    return;
  }

  // CRIT-01 fix + HIGH-03 fix: Search across all subscription programs including previousSubscriptionIds
  let user = await User.findOne(
    buildSubscriptionFindQuery([{ mpSubscriptionId: preapprovalId }])
  );

  if (!user) {
    // HIGH-03: Also search previousSubscriptionIds
    user = await User.findOne(
      buildSubscriptionFindQuery([{ previousSubscriptionIds: preapprovalId }])
    );
    if (user) {
      console.info(`[Subscription Webhook] authorized_payment for old subscription ${preapprovalId}, ignoring`);
      return;
    }
    console.warn(`[Subscription Webhook] No user found for preapproval ${preapprovalId}`);
    return;
  }

  // Find program
  let programId = null;
  for (const [pid, prog] of Object.entries(user.programs?.toJSON?.() || user.programs || {})) {
    if (prog?.subscription?.mpSubscriptionId === preapprovalId) {
      programId = pid;
      break;
    }
  }
  if (!programId) return;

  const userProgram = user.programs[programId];
  const sub = userProgram.subscription;

  // Check if payment already recorded (unique index on mpPaymentId prevents duplicates)
  const existingPayment = await SubscriptionPayment.findOne({ mpPaymentId: String(mpData.payment.id) });
  if (existingPayment) return;

  const paymentStatus = mpData.payment?.status;

  if (paymentStatus === 'approved' || mpData.status === 'processed') {
    // CRIT-01 fix: Use try/catch to handle concurrent webhook race condition.
    // The unique index on mpPaymentId is the real guard — if two webhooks pass
    // the findOne check above simultaneously, the second create will throw 11000.
    try {
      await SubscriptionPayment.create({
        userId: user._id,
        programId,
        mpPaymentId: String(mpData.payment.id),
        mpSubscriptionId: preapprovalId,
        amount: mpData.transaction_amount || mpData.payment?.transaction_amount || sub.priceARS,
        currency: 'ARS',
        status: 'approved',
        retryAttempt: mpData.retry_attempt || 0,
      });
    } catch (err) {
      if (err.code === 11000) {
        console.info(`[Subscription Webhook] Duplicate payment ${mpData.payment.id}, skipping (concurrent webhook)`);
        return;
      }
      throw err;
    }

    // MED-06 fix: Safe +1 month date arithmetic
    const baseDate = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date()
      ? new Date(sub.currentPeriodEnd)
      : new Date();
    const nextEnd = addOneMonth(baseDate);
    const now = new Date();

    const updateFields = {
      [`programs.${programId}.subscription.currentPeriodEnd`]: nextEnd,
      [`programs.${programId}.subscription.lastPaymentAt`]: now,
      [`programs.${programId}.subscription.lastWebhookAt`]: now,
      [`programs.${programId}.hasAccessFlag`]: true,
    };

    // Ensure status is active if it was paused (validate transition)
    if (sub.status === 'paused') {
      if (!isValidTransition('paused', 'active')) {
        console.warn(`[Subscription Webhook] Invalid transition: paused → active for user ${user._id}`);
      } else {
        updateFields[`programs.${programId}.subscription.status`] = 'active';
        await logAudit(user._id, programId, 'paused', 'active', 'webhook', {
          reason: 'payment_approved',
          mpPaymentId: mpData.payment.id,
        });
      }
    }

    await User.findOneAndUpdate({ _id: user._id }, { $set: updateFields });

    // Send payment success email with receipt PDF
    const paymentProgramName = programPricing[programId]?.name || programId;
    const paymentAmount = mpData.transaction_amount || mpData.payment?.transaction_amount || sub.priceARS;
    try {
      const subPaymentDoc = await SubscriptionPayment.findOne({ mpPaymentId: String(mpData.payment.id) });
      if (subPaymentDoc) {
        const { buffer, receiptNumber } = await generateSubscriptionReceipt(subPaymentDoc, user, programId);
        const pdfAttachment = { filename: `${receiptNumber}.pdf`, content: buffer, contentType: "application/pdf" };
        const receiptData = {
          receiptNumber,
          order: { createdAt: subPaymentDoc.createdAt, programId, type: "self", originalAmount: paymentAmount, finalAmount: paymentAmount, discountApplied: 0, currency: "ARS", mpPaymentId: String(mpData.payment.id), status: "approved" },
          user: { firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.email },
          programName: `${paymentProgramName} — Suscripción mensual`,
        };
        sendPaymentSuccessEmail(user.email, paymentProgramName, paymentAmount, nextEnd, pdfAttachment, receiptData);
      } else {
        sendPaymentSuccessEmail(user.email, paymentProgramName, paymentAmount, nextEnd);
      }
    } catch (receiptErr) {
      console.error(`[Subscription] Receipt generation failed for payment ${mpData.payment.id}:`, receiptErr.message);
      sendPaymentSuccessEmail(user.email, paymentProgramName, paymentAmount, nextEnd);
    }
  } else if (mpData.status === 'recycling') {
    // Payment being retried
    try {
      await SubscriptionPayment.create({
        userId: user._id,
        programId,
        mpPaymentId: String(mpData.payment.id),
        mpSubscriptionId: preapprovalId,
        amount: mpData.transaction_amount || sub.priceARS,
        currency: 'ARS',
        status: 'rejected',
        retryAttempt: mpData.retry_attempt || 0,
      });
    } catch (err) {
      if (err.code === 11000) return;
      throw err;
    }

    await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { [`programs.${programId}.subscription.lastWebhookAt`]: new Date() } }
    );

    // Send payment rejected email
    const recyclingProgramName = programPricing[programId]?.name || programId;
    sendPaymentRejectedEmail(user.email, recyclingProgramName, mpData.retry_attempt || 1);
  } else if (paymentStatus === 'rejected' && mpData.status !== 'recycling') {
    // Final rejection
    try {
      await SubscriptionPayment.create({
        userId: user._id,
        programId,
        mpPaymentId: String(mpData.payment.id),
        mpSubscriptionId: preapprovalId,
        amount: mpData.transaction_amount || sub.priceARS,
        currency: 'ARS',
        status: 'rejected',
        retryAttempt: mpData.retry_attempt || 0,
      });
    } catch (err) {
      if (err.code === 11000) return;
      throw err;
    }

    if (sub.status === 'active' && isValidTransition('active', 'paused')) {
      await User.findOneAndUpdate(
        { _id: user._id },
        {
          $set: {
            [`programs.${programId}.subscription.status`]: 'paused',
            [`programs.${programId}.subscription.lastWebhookAt`]: new Date(),
          },
        }
      );
      // Re-read for hasAccess
      const pausedUser = await User.findById(user._id);
      if (pausedUser) await updateHasAccessFlag(pausedUser, programId);

      await logAudit(user._id, programId, 'active', 'paused', 'webhook', {
        reason: 'payment_rejected_final',
        mpPaymentId: mpData.payment.id,
      });
    } else if (sub.status === 'active') {
      console.warn(`[Subscription Webhook] Invalid transition: active → paused for user ${user._id}`);
    } else {
      await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { [`programs.${programId}.subscription.lastWebhookAt`]: new Date() } }
      );
    }

    // Send payment rejected email for final rejection
    const rejectedProgramName = programPricing[programId]?.name || programId;
    sendPaymentRejectedEmail(user.email, rejectedProgramName, mpData.retry_attempt || 1);
  }
}

// ─── Expire cancelled subscriptions past their period ────────────────────
async function expireCancelledSubscriptions() {
  const now = new Date();

  // CRIT-01 fix: Dynamic query across all subscription programs
  const users = await User.find(
    buildSubscriptionFindQuery([{ status: 'cancelled', currentPeriodEnd: { $lte: now } }])
  );

  let expiredCount = 0;

  for (const user of users) {
    for (const [programId, prog] of Object.entries(user.programs?.toJSON?.() || user.programs || {})) {
      const sub = prog?.subscription;
      if (!sub) continue;
      if (sub.status !== 'cancelled') continue;
      if (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > now) continue;
      if (!isValidTransition(sub.status, 'expired')) continue;

      // MED-04 fix: Single atomic update for both status and hasAccessFlag
      try {
        await User.findOneAndUpdate(
          { _id: user._id },
          {
            $set: {
              [`programs.${programId}.subscription.status`]: 'expired',
              [`programs.${programId}.hasAccessFlag`]: false,
            },
          }
        );

        await logAudit(user._id, programId, 'cancelled', 'expired', 'system', {
          reason: 'period_end_reached',
        });

        const expiredProgramName = programPricing[programId]?.name || programId;
        sendSubscriptionExpiredEmail(user.email, expiredProgramName);
        expiredCount++;
      } catch (err) {
        console.error(`[ExpireCron] Error expiring subscription for user ${user._id} program ${programId}:`, err.message);
      }
    }
  }

  return expiredCount;
}

// ─── Retry failed demo transfers ─────────────────────────────────────────
async function retryFailedDemoTransfers() {
  const query = {};
  for (const pid of SUBSCRIPTION_PROGRAMS) {
    query[`programs.${pid}.demoTransferPending`] = true;
  }

  const users = await User.find({ $or: SUBSCRIPTION_PROGRAMS.map(pid => ({
    [`programs.${pid}.demoTransferPending`]: true,
    [`programs.${pid}.subscription.status`]: 'active',
  })) });

  let retried = 0;

  for (const user of users) {
    for (const pid of SUBSCRIPTION_PROGRAMS) {
      if (!user.programs?.[pid]?.demoTransferPending) continue;
      if (user.programs[pid]?.subscription?.status !== 'active') continue;

      try {
        const result = await transferDemoProgress(user._id, pid);
        if (result.transferred) {
          console.info(`[DemoTransferRetry] Transferred for user ${user._id} program ${pid}`);
        }
        // Clear flag regardless of whether there was progress to transfer
        await User.findOneAndUpdate(
          { _id: user._id },
          { $unset: { [`programs.${pid}.demoTransferPending`]: '' } }
        );
        retried++;
      } catch (err) {
        console.error(`[DemoTransferRetry] Still failing for user ${user._id} program ${pid}:`, err.message);
      }
    }
  }

  if (retried > 0) console.info(`[DemoTransferRetry] Retried ${retried} transfers`);
  return retried;
}

module.exports = {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  getPaymentHistory,
  processPreapprovalWebhook,
  processAuthorizedPaymentWebhook,
  expireCancelledSubscriptions,
  retryFailedDemoTransfers,
  updateHasAccessFlag,
  logAudit,
};
