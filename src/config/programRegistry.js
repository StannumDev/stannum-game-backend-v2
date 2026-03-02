/**
 * Centralized program configuration.
 * All program ID lists should be imported from here — never hardcoded in controllers.
 */

const VALID_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'trenno_ia'];

const SUBSCRIPTION_PROGRAMS = ['trenno_ia'];

const PURCHASE_PROGRAMS = ['tmd', 'tia', 'tia_summer'];

// Programs that participate in rankings (excludes demos)
const RANKABLE_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'trenno_ia'];

const DEMO_PROGRAMS = ['demo_trenno'];

const ALL_PROGRAMS = [...VALID_PROGRAMS, ...DEMO_PROGRAMS];

const isValidProgram = (programId) => VALID_PROGRAMS.includes(programId);

const isSubscriptionProgram = (programId) => SUBSCRIPTION_PROGRAMS.includes(programId);

const isPurchaseProgram = (programId) => PURCHASE_PROGRAMS.includes(programId);

const isRankableProgram = (programId) => RANKABLE_PROGRAMS.includes(programId);

const isDemoProgram = (programId) => DEMO_PROGRAMS.includes(programId);

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
};
