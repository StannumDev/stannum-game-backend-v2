/**
 * ============================================================================
 * VERIFY MIGRATION — production DB check
 * ============================================================================
 *
 * Read-only verification script. Checks that all collections and user fields
 * are in the expected state after running migrateToProduction.js.
 *
 * Reports counts of documents with missing/unexpected field values and lists
 * existing indexes.
 *
 * Usage:
 *   node --env-file=.env src/scripts/verifyMigration.js
 *
 * Exit code 0 = all checks passed
 * Exit code 1 = one or more checks failed (see output for details)
 */

'use strict';

const mongoose = require('mongoose');

const ALL_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia'];
const EXPECTED_COLLECTIONS = [
  'users',
  'programs',
  'productkeys',
  'orders',
  'coupons',
  'subscriptionpayments',
  'subscriptionauditlogs',
  'canceltokens',
  'failedemails',
  'assistants',
  'prompts',
];

let totalFailed = 0;

function pass(label, detail = '') {
  console.log(`  ✓  ${label}${detail ? '  — ' + detail : ''}`);
}

function fail(label, detail = '') {
  totalFailed++;
  console.log(`  ✗  ${label}${detail ? '  — ' + detail : ''}`);
}

function warn(label, detail = '') {
  console.log(`  ⚠  ${label}${detail ? '  — ' + detail : ''}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function run() {
  const uri = process.env.DB_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: DB_URL or MONGODB_URI env var not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`Connected to MongoDB (db: ${dbName})\n`);

  const db = mongoose.connection.db;

  // ========================================================================
  // CHECK 1: Collections exist
  // ========================================================================
  section('Collections');

  const existingCollections = (await db.listCollections().toArray()).map((c) => c.name);

  for (const name of EXPECTED_COLLECTIONS) {
    if (existingCollections.includes(name)) {
      const count = await db.collection(name).countDocuments();
      pass(name, `${count} documents`);
    } else {
      fail(name, 'MISSING');
    }
  }

  // ========================================================================
  // CHECK 2: programs collection has expected programs
  // ========================================================================
  section('Programs collection');

  if (existingCollections.includes('programs')) {
    const programs = db.collection('programs');
    const programIds = ['tia', 'tia_summer', 'tia_pool', 'tmd', 'trenno_ia'];
    for (const pid of programIds) {
      const doc = await programs.findOne({ id: pid });
      if (doc) {
        const lessonCount = doc.sections?.reduce(
          (acc, s) => acc + (s.modules?.reduce((a, m) => a + (m.lessons?.length || 0), 0) || 0),
          0
        ) || 0;
        pass(pid, `${lessonCount} lessons`);
      } else {
        fail(pid, 'NOT FOUND in programs collection — run seedPrograms.js');
      }
    }
  } else {
    warn('programs collection missing — skip program checks');
  }

  // ========================================================================
  // CHECK 3: User top-level fields
  // ========================================================================
  section('User top-level fields');

  const users = db.collection('users');
  const totalUsers = await users.countDocuments();
  console.log(`  Total users: ${totalUsers}\n`);

  const topLevelChecks = [
    { field: 'coins', expected: 'number' },
    { field: 'coinsHistory', expected: 'array' },
    { field: 'equippedCoverId', expected: 'string' },
    { field: 'passwordChangedAt', expected: 'exists' },
    { field: 'communityStats', expected: 'exists' },
    { field: 'refreshToken', expected: 'exists' },
    { field: 'favorites', expected: 'exists' },
    { field: 'unlockedCovers', expected: 'array' },
  ];

  for (const { field } of topLevelChecks) {
    const missing = await users.countDocuments({ [field]: { $exists: false } });
    if (missing === 0) {
      pass(field);
    } else {
      fail(field, `${missing} users missing this field`);
    }
  }

  // ========================================================================
  // CHECK 4: dailyStreak sub-fields
  // ========================================================================
  section('User dailyStreak fields');

  const streakFields = ['shields', 'shieldCoveredDate', 'lostCount', 'lostAt'];
  for (const f of streakFields) {
    const missing = await users.countDocuments({ [`dailyStreak.${f}`]: { $exists: false } });
    if (missing === 0) {
      pass(`dailyStreak.${f}`);
    } else {
      fail(`dailyStreak.${f}`, `${missing} users missing`);
    }
  }

  // ========================================================================
  // CHECK 5: Per-program fields
  // ========================================================================
  section('User program fields');

  // tia_pool is optional — only users who purchased/enrolled have it
  const UNIVERSAL_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'trenno_ia'];

  for (const pid of ALL_PROGRAMS) {
    const hasProg = await users.countDocuments({ [`programs.${pid}`]: { $exists: true } });
    if (!UNIVERSAL_PROGRAMS.includes(pid)) {
      console.log(`  ⓘ  programs.${pid}  — ${hasProg}/${totalUsers} (optional)`);
    } else if (hasProg !== totalUsers) {
      fail(`programs.${pid}`, `only ${hasProg}/${totalUsers} users have it`);
      continue;
    } else {
      pass(`programs.${pid}`, `all ${totalUsers} users`);
    }

    const programFieldChecks = [
      `programs.${pid}.totalXp`,
      `programs.${pid}.hasAccessFlag`,
      `programs.${pid}.subscription`,
      `programs.${pid}.chestsOpened`,
      `programs.${pid}.coinsRewardedModules`,
    ];

    for (const f of programFieldChecks) {
      const missing = await users.countDocuments({
        [`programs.${pid}`]: { $exists: true },
        [f]: { $exists: false },
      });
      if (missing === 0) {
        pass(f);
      } else {
        fail(f, `${missing} users missing`);
      }
    }
  }

  // ========================================================================
  // CHECK 6: preferences fields
  // ========================================================================
  section('User preferences fields');

  const prefFields = [
    'preferences.tutorials',
    'preferences.notificationsEnabled',
    'preferences.hasProfilePhoto',
    'preferences.isGoogleAccount',
    'preferences.allowPasswordLogin',
  ];

  for (const f of prefFields) {
    const missing = await users.countDocuments({ [f]: { $exists: false } });
    if (missing === 0) {
      pass(f);
    } else {
      // allowPasswordLogin might be missing in old accounts — warn but don't fail
      if (f.includes('allowPasswordLogin')) {
        warn(f, `${missing} users missing (old accounts may not have this)`);
      } else {
        fail(f, `${missing} users missing`);
      }
    }
  }

  // ========================================================================
  // CHECK 7: otp fields
  // ========================================================================
  section('User otp fields');

  const otpMissing = await users.countDocuments({ 'otp.recoveryVerified': { $exists: false } });
  if (otpMissing === 0) {
    pass('otp.recoveryVerified');
  } else {
    fail('otp.recoveryVerified', `${otpMissing} users missing`);
  }

  // ========================================================================
  // CHECK 8: Data integrity — hasAccessFlag consistency
  // ========================================================================
  section('Data integrity — hasAccessFlag vs isPurchased');

  for (const pid of ALL_PROGRAMS) {
    const mismatch = await users.countDocuments({
      [`programs.${pid}.isPurchased`]: true,
      [`programs.${pid}.hasAccessFlag`]: { $ne: true },
    });
    if (mismatch === 0) {
      pass(`[${pid}] purchased users all have hasAccessFlag=true`);
    } else {
      fail(`[${pid}] ${mismatch} purchased users have hasAccessFlag != true`);
    }
  }

  // ========================================================================
  // CHECK 9: Indexes on users collection
  // ========================================================================
  section('Indexes on users collection');

  const indexes = await users.listIndexes().toArray();
  const indexNames = indexes.map((i) => i.name);
  const expectedIndexes = [
    'refreshToken_token_sparse',
    'hasAccessFlag_compound',
    'trenno_ia_subscription',
  ];

  for (const name of expectedIndexes) {
    if (indexNames.includes(name)) {
      pass(name);
    } else {
      fail(name, 'index missing');
    }
  }

  console.log(`\n  All indexes (${indexes.length} total):`);
  for (const idx of indexes) {
    console.log(`    - ${idx.name}`);
  }

  // ========================================================================
  // CHECK 10: Orders and subscriptions sanity
  // ========================================================================
  section('Orders & Subscriptions sanity');

  if (existingCollections.includes('orders')) {
    const orders = db.collection('orders');
    const pendingExpired = await orders.countDocuments({
      status: 'pending',
      expiresAt: { $lt: new Date() },
    });
    if (pendingExpired === 0) {
      pass('No stale pending orders');
    } else {
      warn('orders', `${pendingExpired} pending orders are past expiresAt`);
    }
  }

  if (existingCollections.includes('subscriptionpayments')) {
    const subPayments = db.collection('subscriptionpayments');
    const dupPayments = await subPayments
      .aggregate([
        { $group: { _id: '$mpPaymentId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
    if (dupPayments.length === 0) {
      pass('No duplicate mpPaymentId in subscriptionpayments');
    } else {
      fail('subscriptionpayments', `${dupPayments.length} duplicate mpPaymentId entries`);
    }
  }

  // ========================================================================
  // FINAL SUMMARY
  // ========================================================================
  console.log('\n============================================');
  if (totalFailed === 0) {
    console.log('VERIFICATION PASSED — all checks OK');
  } else {
    console.log(`VERIFICATION FAILED — ${totalFailed} check(s) failed`);
    console.log('Run migrateToProduction.js to fix missing fields.');
  }
  console.log('============================================\n');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');

  if (totalFailed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('\nVERIFICATION ERROR:', err);
  process.exit(1);
});
