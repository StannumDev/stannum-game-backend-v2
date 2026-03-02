/**
 * Centralized access control functions for program access.
 * Replaces all direct `isPurchased` checks throughout the codebase.
 */

const { VALID_PROGRAMS, DEMO_PROGRAMS } = require('../config/programRegistry');

/**
 * Checks if a user has access to a program's content (and can earn rewards).
 * Works for both one-time purchases AND subscriptions.
 *
 * @param {Object} userProgram - The user's program subdocument (e.g., user.programs.trenno_ia)
 * @returns {boolean}
 */
function hasAccess(userProgram) {
  if (!userProgram) return false;

  // One-time purchase = permanent access
  if (userProgram.isPurchased) return true;

  const sub = userProgram.subscription;
  if (!sub) return false;

  // Active subscription = access
  if (sub.status === 'active') return true;

  // Paused/cancelled/expired but within paid period = access
  if (['paused', 'cancelled', 'expired'].includes(sub.status)) {
    if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date()) return true;
  }

  return false;
}

/**
 * Checks if a user participates in a program (for rankings).
 * Same as hasAccess — if expired, user exits program ranking but stays in global.
 *
 * @param {Object} userProgram
 * @returns {boolean}
 */
function hasProgram(userProgram) {
  return hasAccess(userProgram);
}

/**
 * Checks if the user has access to ANY program (for streak evaluation).
 * If the user has no access to any program, streak is frozen.
 *
 * @param {Object} userPrograms - The user's programs object (e.g., user.programs)
 * @returns {boolean}
 */
function hasAnyAccess(userPrograms) {
  if (!userPrograms) return false;
  const allPrograms = [...VALID_PROGRAMS, ...DEMO_PROGRAMS];
  return allPrograms.some(programId => {
    return userPrograms[programId] && hasAccess(userPrograms[programId]);
  });
}

/**
 * Builds a MongoDB $or query for finding users with access to any rankable program.
 * Uses the denormalized hasAccessFlag field for efficient querying.
 *
 * @param {string[]} programIds - Array of program IDs to check
 * @returns {Object[]} Array of $or conditions for MongoDB query
 */
function buildAccessQuery(programIds) {
  return programIds.map(p => ({
    [`programs.${p}.hasAccessFlag`]: true,
  }));
}

/**
 * Builds a MongoDB $or query for a single program's access.
 * Uses hasAccessFlag for efficiency.
 *
 * @param {string} programId
 * @returns {Object}
 */
function buildProgramAccessQuery(programId) {
  return { [`programs.${programId}.hasAccessFlag`]: true };
}

module.exports = {
  hasAccess,
  hasProgram,
  hasAnyAccess,
  buildAccessQuery,
  buildProgramAccessQuery,
};
