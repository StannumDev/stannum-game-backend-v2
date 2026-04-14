/**
 * Centralized program configuration.
 * All program ID lists should be imported from here — never hardcoded in controllers.
 *
 * Hardcoded lists are kept as fallback for when the DB is not yet loaded.
 * Use the async helpers (loadProgramRegistry / getDynamic*) for runtime checks
 * that read the `type` field from MongoDB, so new programs added via the
 * Trenno Dashboard are automatically recognized.
 */

const { getPrograms } = require("../services/programCacheService");

// ── Fallback hardcoded lists (used during startup / if cache is cold) ──
const VALID_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia'];
const SUBSCRIPTION_PROGRAMS = ['trenno_ia'];
const PURCHASE_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool'];
const RANKABLE_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia'];
const DEMO_PROGRAMS = ['demo_trenno'];
const ALL_PROGRAMS = [...VALID_PROGRAMS, ...DEMO_PROGRAMS];

// ── Dynamic helpers (read from DB via cache) ──
const getDynamicProgramsByType = async (type) => {
  const programs = await getPrograms();
  return programs.filter((p) => p.type === type).map((p) => p.id);
};

const getAllProgramIds = async () => {
  const programs = await getPrograms();
  return programs.map((p) => p.id);
};

const isValidProgram = (programId) => VALID_PROGRAMS.includes(programId);
const isSubscriptionProgram = (programId) => SUBSCRIPTION_PROGRAMS.includes(programId);
const isPurchaseProgram = (programId) => PURCHASE_PROGRAMS.includes(programId);
const isRankableProgram = (programId) => RANKABLE_PROGRAMS.includes(programId);
const isDemoProgram = (programId) => DEMO_PROGRAMS.includes(programId);

// Async version that checks DB
const isValidProgramAsync = async (programId) => {
  const ids = await getAllProgramIds();
  return ids.includes(programId);
};

const isSubscriptionProgramAsync = async (programId) => {
  const ids = await getDynamicProgramsByType("subscription");
  return ids.includes(programId);
};

const isPurchaseProgramAsync = async (programId) => {
  const ids = await getDynamicProgramsByType("purchase");
  return ids.includes(programId);
};

const isDemoProgramAsync = async (programId) => {
  const ids = await getDynamicProgramsByType("demo");
  return ids.includes(programId);
};

module.exports = {
  VALID_PROGRAMS,
  SUBSCRIPTION_PROGRAMS,
  PURCHASE_PROGRAMS,
  RANKABLE_PROGRAMS,
  DEMO_PROGRAMS,
  ALL_PROGRAMS,
  isValidProgram,
  isSubscriptionProgram,
  isPurchaseProgram,
  isRankableProgram,
  isDemoProgram,
  // Async (DB-backed) helpers
  getAllProgramIds,
  getDynamicProgramsByType,
  isValidProgramAsync,
  isSubscriptionProgramAsync,
  isPurchaseProgramAsync,
  isDemoProgramAsync,
};
