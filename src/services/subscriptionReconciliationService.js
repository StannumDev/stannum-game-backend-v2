const axios = require("axios");
const User = require("../models/userModel");
const SubscriptionAuditLog = require("../models/subscriptionAuditLogModel");
const { updateHasAccessFlag, logAudit } = require("./subscriptionService");
const { isSubscriptionProgram } = require("../config/programRegistry");
const programPricing = require("../config/programPricing");

const MP_API = "https://api.mercadopago.com";
const mpHeaders = () => ({
  Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
});

// Rate limiter: N requests per second
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rateLimitedFetch = async (url, ratePerSec = 10) => {
  const delay = Math.ceil(1000 / ratePerSec);
  await sleep(delay);
  return axios.get(url, { headers: mpHeaders(), timeout: 10000 });
};

// ─── Subscription program IDs ──────────────────────────────────────────
const getSubscriptionProgramIds = () =>
  Object.keys(programPricing).filter((k) => programPricing[k].type === "subscription");

// ─── Reconcile a single subscription ──────────────────────────────────
async function reconcileSubscription(user, programId, ratePerSec) {
  const sub = user.programs?.[programId]?.subscription;
  if (!sub?.mpSubscriptionId) return null;

  try {
    const { data: mpData } = await rateLimitedFetch(
      `${MP_API}/preapproval/${sub.mpSubscriptionId}`,
      ratePerSec
    );

    const mpStatusMap = {
      authorized: "active",
      paused: "paused",
      cancelled: "cancelled",
      // NOTE: MP "pending" is intentionally NOT mapped — it means the user
      // hasn't authorized yet, so we must NOT grant access.
    };

    const mpStatus = mpStatusMap[mpData.status];
    if (!mpStatus) return null;

    if (mpStatus !== sub.status) {
      const previousStatus = sub.status;
      const now = new Date();

      // Atomic update to prevent race conditions with concurrent webhooks
      const updateFields = {
        [`programs.${programId}.subscription.status`]: mpStatus,
        [`programs.${programId}.subscription.lastWebhookAt`]: now,
      };

      if (mpStatus === "cancelled" && !sub.cancelledAt) {
        updateFields[`programs.${programId}.subscription.cancelledAt`] = now;
      }

      await User.findOneAndUpdate({ _id: user._id }, { $set: updateFields });

      // Re-read user for hasAccess calculation
      const updatedUser = await User.findById(user._id);
      if (updatedUser) await updateHasAccessFlag(updatedUser, programId);

      await logAudit(user._id, programId, previousStatus, mpStatus, "reconciliation", {
        mpPreapprovalId: sub.mpSubscriptionId,
        mpRawStatus: mpData.status,
      });

      return { userId: user._id, programId, from: previousStatus, to: mpStatus };
    }
  } catch (err) {
    console.error(
      `[Reconciliation] Failed for user ${user._id} program ${programId}:`,
      err.message
    );
  }
  return null;
}

// ─── Hot reconciliation — every 6 hours ─────────────────────────────
async function reconcileHot() {
  const startTime = Date.now();
  const programIds = getSubscriptionProgramIds();
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Find subscriptions near period end OR paused
  const orConditions = programIds.flatMap((pid) => [
    {
      [`programs.${pid}.subscription.status`]: "active",
      [`programs.${pid}.subscription.currentPeriodEnd`]: { $lte: in48h, $gte: now },
    },
    {
      [`programs.${pid}.subscription.status`]: "paused",
    },
  ]);

  if (orConditions.length === 0) return { checked: 0, fixed: 0, durationMs: 0 };

  const users = await User.find({ $or: orConditions });
  let checked = 0;
  let fixed = 0;
  const fixes = [];

  for (const user of users) {
    for (const pid of programIds) {
      const sub = user.programs?.[pid]?.subscription;
      if (!sub?.mpSubscriptionId) continue;
      if (!["active", "paused"].includes(sub.status)) continue;

      checked++;
      const result = await reconcileSubscription(user, pid, 10);
      if (result) {
        fixed++;
        fixes.push(result);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  console.info(
    `[Reconciliation Hot] Checked ${checked}, fixed ${fixed} in ${durationMs}ms`
  );

  // Alert if too many fixes
  if (fixed > 5) {
    console.warn(
      `[ALERT] Hot reconciliation fixed ${fixed} subscriptions — possible webhook issue`
    );
  }

  return { checked, fixed, fixes, durationMs };
}

// ─── Cold reconciliation — daily at 4am ──────────────────────────────
async function reconcileCold() {
  const startTime = Date.now();
  const programIds = getSubscriptionProgramIds();

  // Find ALL non-expired subscriptions
  const orConditions = programIds.flatMap((pid) =>
    ["active", "paused", "cancelled"].map((status) => ({
      [`programs.${pid}.subscription.status`]: status,
    }))
  );

  if (orConditions.length === 0) return { checked: 0, fixed: 0, durationMs: 0 };

  const users = await User.find({ $or: orConditions });
  let checked = 0;
  let fixed = 0;
  const fixes = [];

  for (const user of users) {
    for (const pid of programIds) {
      const sub = user.programs?.[pid]?.subscription;
      if (!sub?.mpSubscriptionId) continue;
      if (sub.status === "expired" || !sub.status) continue;

      checked++;
      const result = await reconcileSubscription(user, pid, 5);
      if (result) {
        fixed++;
        fixes.push(result);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  console.info(
    `[Reconciliation Cold] Checked ${checked}, fixed ${fixed} in ${durationMs}ms`
  );

  if (fixed > 5) {
    console.warn(
      `[ALERT] Cold reconciliation fixed ${fixed} subscriptions — investigate webhook delivery`
    );
  }

  return { checked, fixed, fixes, durationMs };
}

// ─── Check for stale webhooks ──────────────────────────────────────
async function checkWebhookHealth() {
  const programIds = getSubscriptionProgramIds();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Check if we've received any webhook in the last 24h
  const orConditions = programIds.map((pid) => ({
    [`programs.${pid}.subscription.status`]: "active",
    [`programs.${pid}.subscription.lastWebhookAt`]: { $gte: oneDayAgo },
  }));

  if (orConditions.length === 0) return { healthy: true };

  const recentWebhookCount = await User.countDocuments({ $or: orConditions });

  // Count total active subscriptions
  const activeConditions = programIds.map((pid) => ({
    [`programs.${pid}.subscription.status`]: "active",
  }));
  const totalActive = await User.countDocuments({ $or: activeConditions });

  if (totalActive > 0 && recentWebhookCount === 0) {
    console.warn(
      `[ALERT] No webhooks received in 24h with ${totalActive} active subscriptions`
    );
    return { healthy: false, totalActive, recentWebhookCount };
  }

  return { healthy: true, totalActive, recentWebhookCount };
}

// ─── Health statistics ─────────────────────────────────────────────
async function getSubscriptionHealthStats() {
  const programIds = getSubscriptionProgramIds();

  const buildCountQuery = (status) =>
    programIds.map((pid) => ({ [`programs.${pid}.subscription.status`]: status }));

  const [active, paused, cancelled, expired] = await Promise.all([
    User.countDocuments({ $or: buildCountQuery("active") }),
    User.countDocuments({ $or: buildCountQuery("paused") }),
    User.countDocuments({ $or: buildCountQuery("cancelled") }),
    User.countDocuments({ $or: buildCountQuery("expired") }),
  ]);

  // Expiring in next 24h
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const expiringConditions = programIds.map((pid) => ({
    [`programs.${pid}.subscription.status`]: "cancelled",
    [`programs.${pid}.subscription.currentPeriodEnd`]: { $lte: in24h, $gte: now },
  }));
  const expiringIn24h = expiringConditions.length > 0
    ? await User.countDocuments({ $or: expiringConditions })
    : 0;

  // Last webhook
  const lastAuditLog = await SubscriptionAuditLog.findOne({ trigger: "webhook" })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();

  return {
    activeSubscriptions: active,
    pausedSubscriptions: paused,
    cancelledSubscriptions: cancelled,
    expiredSubscriptions: expired,
    expiringIn24h,
    lastWebhookReceivedAt: lastAuditLog?.createdAt || null,
  };
}

module.exports = {
  reconcileHot,
  reconcileCold,
  checkWebhookHealth,
  getSubscriptionHealthStats,
};
