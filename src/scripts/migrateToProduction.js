/**
 * ============================================================================
 * MIGRATION SCRIPT: development → production
 * ============================================================================
 *
 * Migrates the production (main) database to match the development branch
 * schema. Safe to run multiple times — all steps are idempotent.
 *
 * What it does (in order):
 *   1.  Add top-level user fields: coins, coinsHistory, equippedCoverId, passwordChangedAt
 *   2.  Add dailyStreak fields: shields, shieldCoveredDate, lostCount, lostAt
 *   3.  Add program fields to existing programs: totalXp, chestsOpened, coinsRewardedModules, coinsRewardedProgram
 *   4.  Add trenno_ia program to all users
 *   5.  Set hasAccessFlag based on isPurchased
 *   6.  Initialise subscription subdoc on all programs
 *   7.  Add coinsReward to existing achievements
 *   8.  Compute totalXp from xpHistory
 *   9.  Add communityStats, refreshToken, otp.recoveryVerified
 *  10.  Add favorites object (prompts + assistants arrays)
 *  11.  Add default cover to unlockedCovers
 *  12.  Create indexes
 *
 * Usage:
 *   node --env-file=.env src/scripts/migrateToProduction.js
 *
 * Requirements:
 *   - DB_URL or MONGODB_URI env var pointing to PRODUCTION database
 *   - CONFIRM_MIGRATION=yes in env or --yes flag
 *   - Database backup completed BEFORE running
 */

'use strict';

const mongoose = require('mongoose');

const EXISTING_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool'];
const ALL_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia'];

const TRENNO_IA_DEFAULT = {
  isPurchased: false,
  totalXp: 0,
  acquiredAt: null,
  instructions: [],
  lessonsCompleted: [],
  chestsOpened: [],
  coinsRewardedModules: [],
  coinsRewardedProgram: false,
  lastWatchedLesson: { lessonId: null, viewedAt: null, currentTime: 0 },
  tests: [],
  productKey: null,
  subscription: {
    status: null,
    mpSubscriptionId: null,
    priceARS: null,
    currentPeriodEnd: null,
    subscribedAt: null,
    cancelledAt: null,
    lastPaymentAt: null,
    lastWebhookAt: null,
    pendingExpiresAt: null,
    previousSubscriptionIds: [],
  },
  hasAccessFlag: false,
};

const SUBSCRIPTION_DEFAULT = {
  status: null,
  mpSubscriptionId: null,
  priceARS: null,
  currentPeriodEnd: null,
  subscribedAt: null,
  cancelledAt: null,
  lastPaymentAt: null,
  lastWebhookAt: null,
  pendingExpiresAt: null,
  previousSubscriptionIds: [],
};

async function run() {
  const uri = process.env.DB_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: DB_URL or MONGODB_URI env var not set');
    process.exit(1);
  }

  const confirmed = process.env.CONFIRM_MIGRATION === 'yes' || process.argv.includes('--yes');
  if (!confirmed) {
    console.error('ERROR: Production migration requires explicit confirmation.');
    console.error('       Re-run with --yes or set CONFIRM_MIGRATION=yes');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const dbName = mongoose.connection.db.databaseName;
  console.log(`Connected to MongoDB (db: ${dbName})\n`);

  const db = mongoose.connection.db;
  const users = db.collection('users');

  const totalUsers = await users.countDocuments();
  console.log(`Total users in database: ${totalUsers}\n`);

  // ========================================================================
  // STEP 1: Add top-level user fields
  // ========================================================================
  console.log('=== STEP 1: Add top-level user fields ===');

  const step1a = await users.updateMany(
    { coins: { $exists: false } },
    { $set: { coins: 0, coinsHistory: [], equippedCoverId: 'default' } }
  );
  console.log(`  coins/coinsHistory/equippedCoverId added to ${step1a.modifiedCount} users`);

  // passwordChangedAt checked independently — one user may already have coins but lack this field
  const step1b = await users.updateMany(
    { passwordChangedAt: { $exists: false } },
    { $set: { passwordChangedAt: null } }
  );
  console.log(`  passwordChangedAt added to ${step1b.modifiedCount} users`);

  // ========================================================================
  // STEP 2: Add dailyStreak fields (each checked independently)
  // ========================================================================
  console.log('\n=== STEP 2: Add dailyStreak fields ===');

  const step2a = await users.updateMany(
    { 'dailyStreak.shields': { $exists: false } },
    { $set: { 'dailyStreak.shields': 0 } }
  );
  const step2b = await users.updateMany(
    { 'dailyStreak.shieldCoveredDate': { $exists: false } },
    { $set: { 'dailyStreak.shieldCoveredDate': null } }
  );
  const step2c = await users.updateMany(
    { 'dailyStreak.lostCount': { $exists: false } },
    { $set: { 'dailyStreak.lostCount': null } }
  );
  const step2d = await users.updateMany(
    { 'dailyStreak.lostAt': { $exists: false } },
    { $set: { 'dailyStreak.lostAt': null } }
  );
  console.log(`  shields: ${step2a.modifiedCount}  shieldCoveredDate: ${step2b.modifiedCount}  lostCount: ${step2c.modifiedCount}  lostAt: ${step2d.modifiedCount}`);

  // ========================================================================
  // STEP 3: Add new fields to existing programs
  // ========================================================================
  console.log('\n=== STEP 3: Add new fields to existing programs ===');

  for (const pid of EXISTING_PROGRAMS) {
    const result = await users.updateMany(
      {
        [`programs.${pid}`]: { $exists: true },
        [`programs.${pid}.totalXp`]: { $exists: false },
      },
      {
        $set: {
          [`programs.${pid}.totalXp`]: 0,
          [`programs.${pid}.chestsOpened`]: [],
          [`programs.${pid}.coinsRewardedModules`]: [],
          [`programs.${pid}.coinsRewardedProgram`]: false,
        },
      }
    );
    console.log(`  [${pid}] totalXp/chestsOpened/coinsRewarded added to ${result.modifiedCount} users`);
  }

  // ========================================================================
  // STEP 4: Add trenno_ia program
  // ========================================================================
  console.log('\n=== STEP 4: Add trenno_ia program ===');

  const step4 = await users.updateMany(
    { 'programs.trenno_ia': { $exists: false } },
    { $set: { 'programs.trenno_ia': TRENNO_IA_DEFAULT } }
  );
  console.log(`  trenno_ia added to ${step4.modifiedCount} users`);

  // ========================================================================
  // STEP 5: Set hasAccessFlag based on isPurchased
  // ========================================================================
  console.log('\n=== STEP 5: Set hasAccessFlag ===');

  for (const pid of ALL_PROGRAMS) {
    const r1 = await users.updateMany(
      { [`programs.${pid}.isPurchased`]: true },
      { $set: { [`programs.${pid}.hasAccessFlag`]: true } }
    );
    console.log(`  [${pid}] hasAccessFlag=true for ${r1.modifiedCount} purchased users`);

    const r2 = await users.updateMany(
      {
        [`programs.${pid}`]: { $exists: true },
        [`programs.${pid}.isPurchased`]: { $ne: true },
        [`programs.${pid}.hasAccessFlag`]: { $exists: false },
      },
      { $set: { [`programs.${pid}.hasAccessFlag`]: false } }
    );
    console.log(`  [${pid}] hasAccessFlag=false for ${r2.modifiedCount} non-purchased users`);
  }

  // ========================================================================
  // STEP 6: Initialise subscription subdoc on all programs
  // ========================================================================
  console.log('\n=== STEP 6: Initialise subscription subdoc ===');

  for (const pid of ALL_PROGRAMS) {
    const result = await users.updateMany(
      {
        [`programs.${pid}`]: { $exists: true },
        [`programs.${pid}.subscription`]: { $exists: false },
      },
      { $set: { [`programs.${pid}.subscription`]: SUBSCRIPTION_DEFAULT } }
    );
    console.log(`  [${pid}] subscription subdoc initialised for ${result.modifiedCount} users`);
  }

  // ========================================================================
  // STEP 7: Add coinsReward to existing achievements
  // ========================================================================
  console.log('\n=== STEP 7: Add coinsReward to achievements ===');

  const step7 = await users.updateMany(
    { 'achievements.0': { $exists: true } },
    { $set: { 'achievements.$[elem].coinsReward': 0 } },
    { arrayFilters: [{ 'elem.coinsReward': { $exists: false } }] }
  );
  console.log(`  coinsReward added to achievements in ${step7.modifiedCount} users`);

  // ========================================================================
  // STEP 8: Compute totalXp from xpHistory
  // ========================================================================
  console.log('\n=== STEP 8: Compute totalXp from xpHistory ===');

  const XP_TYPES = ['LESSON_COMPLETED', 'INSTRUCTION_GRADED'];
  const cursor = users.find({ 'xpHistory.0': { $exists: true } });
  let xpUpdated = 0;

  for await (const user of cursor) {
    const xpByProgram = {};

    for (const entry of user.xpHistory || []) {
      if (!XP_TYPES.includes(entry.type)) continue;
      const progId = entry.meta?.programId;
      if (!progId) continue;
      xpByProgram[progId] = (xpByProgram[progId] || 0) + (entry.xp || 0);
    }

    const updates = {};
    let changed = false;
    for (const [progId, totalXp] of Object.entries(xpByProgram)) {
      if (user.programs?.[progId]) {
        const current = user.programs[progId].totalXp || 0;
        if (current !== totalXp) {
          updates[`programs.${progId}.totalXp`] = totalXp;
          changed = true;
        }
      }
    }

    if (changed) {
      await users.updateOne({ _id: user._id }, { $set: updates });
      xpUpdated++;
    }
  }
  console.log(`  totalXp computed for ${xpUpdated} users`);

  // ========================================================================
  // STEP 9: Add communityStats, refreshToken, otp.recoveryVerified
  // ========================================================================
  console.log('\n=== STEP 9: Add communityStats / refreshToken / otp.recoveryVerified ===');

  const step9a = await users.updateMany(
    { communityStats: { $exists: false } },
    {
      $set: {
        communityStats: {
          promptsCount: 0,
          assistantsCount: 0,
          totalFavoritesReceived: 0,
        },
      },
    }
  );
  console.log(`  communityStats added to ${step9a.modifiedCount} users`);

  const step9b = await users.updateMany(
    { refreshToken: { $exists: false } },
    { $set: { refreshToken: { token: null, expiresAt: null } } }
  );
  console.log(`  refreshToken added to ${step9b.modifiedCount} users`);

  const step9c = await users.updateMany(
    { 'otp.recoveryVerified': { $exists: false } },
    { $set: { 'otp.recoveryVerified': false } }
  );
  console.log(`  otp.recoveryVerified added to ${step9c.modifiedCount} users`);

  // ========================================================================
  // STEP 10: Add favorites object
  // ========================================================================
  console.log('\n=== STEP 10: Add favorites object ===');

  const step10 = await users.updateMany(
    { favorites: { $exists: false } },
    { $set: { favorites: { prompts: [], assistants: [] } } }
  );
  console.log(`  favorites added to ${step10.modifiedCount} users`);

  // ========================================================================
  // STEP 11: Add default cover to unlockedCovers
  // ========================================================================
  console.log('\n=== STEP 11: Add default cover to unlockedCovers ===');

  // All production users already have unlockedCovers:[] (empty array), so check for
  // both missing field and empty array.
  const step11 = await users.updateMany(
    { $or: [{ unlockedCovers: { $exists: false } }, { unlockedCovers: { $size: 0 } }] },
    {
      $set: {
        unlockedCovers: [{ coverId: 'default', unlockedDate: new Date() }],
      },
    }
  );
  console.log(`  unlockedCovers (default) added to ${step11.modifiedCount} users`);

  // ========================================================================
  // STEP 12: Create indexes
  // ========================================================================
  console.log('\n=== STEP 12: Create indexes ===');

  try {
    await users.createIndex(
      { 'refreshToken.token': 1 },
      { sparse: true, name: 'refreshToken_token_sparse' }
    );
    console.log('  Created: refreshToken.token (sparse)');
  } catch (err) {
    console.log(`  refreshToken.token: ${err.message}`);
  }

  try {
    const accessFlagIndex = {};
    for (const pid of ALL_PROGRAMS) {
      accessFlagIndex[`programs.${pid}.hasAccessFlag`] = 1;
    }
    accessFlagIndex.status = 1;
    accessFlagIndex['level.experienceTotal'] = -1;
    await users.createIndex(accessFlagIndex, { name: 'hasAccessFlag_compound' });
    console.log('  Created: hasAccessFlag compound index');
  } catch (err) {
    console.log(`  hasAccessFlag compound: ${err.message}`);
  }

  try {
    await users.createIndex(
      {
        'programs.trenno_ia.subscription.status': 1,
        'programs.trenno_ia.subscription.currentPeriodEnd': 1,
      },
      { name: 'trenno_ia_subscription' }
    );
    console.log('  Created: trenno_ia subscription index');
  } catch (err) {
    console.log(`  trenno_ia subscription: ${err.message}`);
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n============================================');
  console.log('MIGRATION COMPLETE');
  console.log('============================================');
  console.log(`DB: ${dbName}`);
  console.log(`Total users: ${totalUsers}`);
  console.log('\nManual steps remaining:');
  console.log('  1. Seed Program collection if empty:');
  console.log('     node --env-file=.env src/migrations/seedPrograms.js');
  console.log('  2. Run verification:');
  console.log('     node --env-file=.env src/scripts/verifyMigration.js');
  console.log('  3. Disable maintenance mode once verified');
  console.log('============================================\n');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

run().catch((err) => {
  console.error('\nMIGRATION FAILED:', err);
  process.exit(1);
});
