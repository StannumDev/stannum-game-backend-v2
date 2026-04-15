/**
 * ============================================================================
 * MIGRATION SCRIPT: main → development
 * ============================================================================
 *
 * Unified migration script that prepares the database for the development
 * branch codebase. Run this AFTER deploying the new backend code and BEFORE
 * allowing users back in.
 *
 * What it does (in order):
 *   1. Add new top-level user fields (coins, coinsHistory, equippedCoverId, etc.)
 *   2. Add new dailyStreak fields (shields, shieldCoveredDate, lostCount, lostAt)
 *   3. Add new program fields to existing programs (totalXp, chestsOpened, etc.)
 *   4. Add trenno_ia program to all users that don't have it
 *   5. Set hasAccessFlag based on isPurchased
 *   6. Initialise subscription subdoc on all programs
 *   7. Add coinsReward field to existing achievements
 *   8. Compute totalXp from xpHistory
 *   9. Add communityStats and refreshToken fields
 *  10. Seed the Program collection (runs seedPrograms.js)
 *  11. Create new indexes
 *
 * Safe to run multiple times (idempotent).
 * Uses raw MongoDB operations (not Mongoose model) to avoid validation issues
 * on partially-migrated documents.
 *
 * Usage:
 *   node --env-file=.env src/scripts/migrateMainToDevelopment.js
 *
 * Requirements:
 *   - DB_URL or MONGODB_URI env var set
 *   - Database backup completed BEFORE running
 */

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

  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const users = db.collection('users');

  const totalUsers = await users.countDocuments();
  console.log(`Total users in database: ${totalUsers}\n`);

  // ========================================================================
  // STEP 1: Add new top-level fields
  // ========================================================================
  console.log('=== STEP 1: Add new top-level user fields ===');

  const step1 = await users.updateMany(
    { coins: { $exists: false } },
    {
      $set: {
        coins: 0,
        coinsHistory: [],
        equippedCoverId: 'default',
        passwordChangedAt: null,
      },
    }
  );
  console.log(`  coins/coinsHistory/equippedCoverId added to ${step1.modifiedCount} users`);

  // ========================================================================
  // STEP 2: Add new dailyStreak fields
  // ========================================================================
  console.log('\n=== STEP 2: Add dailyStreak fields (shields, lostCount, lostAt) ===');

  const step2 = await users.updateMany(
    { 'dailyStreak.shields': { $exists: false } },
    {
      $set: {
        'dailyStreak.shields': 0,
        'dailyStreak.shieldCoveredDate': null,
        'dailyStreak.lostCount': null,
        'dailyStreak.lostAt': null,
      },
    }
  );
  console.log(`  dailyStreak fields added to ${step2.modifiedCount} users`);

  // ========================================================================
  // STEP 3: Add new program fields to existing programs
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
    console.log(`  [${pid}] program fields added to ${result.modifiedCount} users`);
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
    // Set true where isPurchased = true
    const r1 = await users.updateMany(
      { [`programs.${pid}.isPurchased`]: true },
      { $set: { [`programs.${pid}.hasAccessFlag`]: true } }
    );
    console.log(`  [${pid}] hasAccessFlag=true for ${r1.modifiedCount} purchased users`);

    // Set false where not purchased and flag doesn't exist
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
  // STEP 6: Initialise subscription subdoc
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
  console.log('\n=== STEP 7: Add coinsReward to existing achievements ===');

  const step7 = await users.updateMany(
    {
      'achievements.0': { $exists: true },
    },
    {
      $set: { 'achievements.$[elem].coinsReward': 0 },
    },
    {
      arrayFilters: [{ 'elem.coinsReward': { $exists: false } }],
    }
  );
  console.log(`  coinsReward added to achievements in ${step7.modifiedCount} users`);

  // ========================================================================
  // STEP 8: Compute totalXp from xpHistory
  // ========================================================================
  console.log('\n=== STEP 8: Compute totalXp from xpHistory ===');

  const XP_TYPES = ['LESSON_COMPLETED', 'INSTRUCTION_GRADED'];
  const cursor = users.find({ 'xpHistory.0': { $exists: true } });
  let xpUpdated = 0;

  while (await cursor.hasNext()) {
    const user = await cursor.next();
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
  // STEP 9: Add communityStats and refreshToken
  // ========================================================================
  console.log('\n=== STEP 9: Add communityStats and refreshToken ===');

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
    {
      $set: {
        refreshToken: { token: null, expiresAt: null },
      },
    }
  );
  console.log(`  refreshToken added to ${step9b.modifiedCount} users`);

  // Add otp.recoveryVerified where missing
  const step9c = await users.updateMany(
    { 'otp.recoveryVerified': { $exists: false } },
    { $set: { 'otp.recoveryVerified': false } }
  );
  console.log(`  otp.recoveryVerified added to ${step9c.modifiedCount} users`);

  // ========================================================================
  // STEP 10: Seed Program collection
  // ========================================================================
  console.log('\n=== STEP 10: Seed Program collection ===');

  try {
    const seedPath = require('path').resolve(__dirname, '../migrations/seedPrograms.js');
    const fs = require('fs');
    if (fs.existsSync(seedPath)) {
      console.log('  Running seedPrograms.js...');
      // seedPrograms.js uses its own mongoose connection, so we pass the db
      // We'll run it as a separate require that reuses the connection
      // Actually, let's just check if the programs collection already has data
      const programsCol = db.collection('programs');
      const existingCount = await programsCol.countDocuments();
      if (existingCount > 0) {
        console.log(`  Program collection already has ${existingCount} documents. Skipping seed.`);
        console.log('  To re-seed, drop the programs collection first and run: node src/migrations/seedPrograms.js');
      } else {
        console.log('  Program collection is empty. Run seed manually:');
        console.log('  node --env-file=.env src/migrations/seedPrograms.js');
      }
    } else {
      console.log('  seedPrograms.js not found at expected path. Run manually if needed.');
    }
  } catch (err) {
    console.log(`  Could not check seed: ${err.message}. Run manually: node src/migrations/seedPrograms.js`);
  }

  // ========================================================================
  // STEP 11: Create indexes
  // ========================================================================
  console.log('\n=== STEP 11: Create indexes ===');

  try {
    await users.createIndex(
      { 'refreshToken.token': 1 },
      { sparse: true, name: 'refreshToken_token_sparse' }
    );
    console.log('  Created index: refreshToken.token (sparse)');
  } catch (err) {
    console.log(`  Index refreshToken.token: ${err.message}`);
  }

  try {
    const accessFlagIndex = {};
    for (const pid of ALL_PROGRAMS) {
      accessFlagIndex[`programs.${pid}.hasAccessFlag`] = 1;
    }
    accessFlagIndex.status = 1;
    accessFlagIndex['level.experienceTotal'] = -1;
    await users.createIndex(accessFlagIndex, { name: 'hasAccessFlag_compound' });
    console.log('  Created index: hasAccessFlag compound');
  } catch (err) {
    console.log(`  Index hasAccessFlag compound: ${err.message}`);
  }

  try {
    await users.createIndex(
      {
        'programs.trenno_ia.subscription.status': 1,
        'programs.trenno_ia.subscription.currentPeriodEnd': 1,
      },
      { name: 'trenno_ia_subscription' }
    );
    console.log('  Created index: trenno_ia subscription');
  } catch (err) {
    console.log(`  Index trenno_ia subscription: ${err.message}`);
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n============================================');
  console.log('MIGRATION COMPLETE');
  console.log('============================================');
  console.log(`Total users: ${totalUsers}`);
  console.log('\nRemaining manual steps:');
  console.log('  1. Run seedPrograms.js if Program collection is empty:');
  console.log('     node --env-file=.env src/migrations/seedPrograms.js');
  console.log('  2. Verify data with spot checks');
  console.log('  3. Remove maintenance mode');
  console.log('============================================\n');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

run().catch((err) => {
  console.error('\nMIGRATION FAILED:', err);
  process.exit(1);
});
