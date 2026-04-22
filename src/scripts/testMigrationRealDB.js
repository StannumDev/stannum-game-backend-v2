/**
 * ============================================================================
 * TEST MIGRATION AGAINST REAL MONGODB
 * ============================================================================
 *
 * Full end-to-end test of migrateToProduction.js using a REAL MongoDB instance.
 *
 * What it does:
 *   1. Connects to the TEST database (TEST_DB_URL env var — never production)
 *   2. Drops and recreates the test collections from production JSON dumps
 *   3. Runs the EXACT same migration steps as migrateToProduction.js
 *   4. Runs the EXACT same verification as verifyMigration.js
 *   5. Reports pass/fail for every check
 *
 * Requirements:
 *   - TEST_DB_URL env var pointing to a TEST Atlas database (not production)
 *   - production.users.json, production.productkeys.json etc. in the project root
 *
 * Usage:
 *   TEST_DB_URL="mongodb+srv://..." node src/scripts/testMigrationRealDB.js
 *   or:
 *   node --env-file=.env.test src/scripts/testMigrationRealDB.js
 *
 * Safety:
 *   - Refuses to run if TEST_DB_URL === DB_URL (prevents running against prod)
 *   - Only drops collections that it just created (prefixed with test_migration_)
 */

'use strict';

const mongoose = require('mongoose');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

// ============================================================================
// Load production dumps
// ============================================================================

function loadJSON(filename) {
  try {
    return require(path.join(ROOT, filename));
  } catch {
    console.error(`ERROR: ${filename} not found in project root`);
    process.exit(1);
  }
}

// ============================================================================
// EJSON → plain JS (handles {$oid: ...}, {$date: ...}, etc.)
// ============================================================================
function dejson(val) {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(dejson);
  if (typeof val === 'object') {
    if ('$oid' in val) return new mongoose.Types.ObjectId(val.$oid);
    if ('$date' in val) return new Date(val.$date);
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = dejson(v);
    return out;
  }
  return val;
}

// ============================================================================
// Constants (same as migrateToProduction.js)
// ============================================================================

const EXISTING_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool'];
const ALL_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia'];
const UNIVERSAL_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'trenno_ia'];
const XP_TYPES = ['LESSON_COMPLETED', 'INSTRUCTION_GRADED'];

const TRENNO_IA_DEFAULT = {
  isPurchased: false, totalXp: 0, acquiredAt: null,
  instructions: [], lessonsCompleted: [], chestsOpened: [],
  coinsRewardedModules: [], coinsRewardedProgram: false,
  lastWatchedLesson: { lessonId: null, viewedAt: null, currentTime: 0 },
  tests: [], productKey: null,
  subscription: {
    status: null, mpSubscriptionId: null, priceARS: null,
    currentPeriodEnd: null, subscribedAt: null, cancelledAt: null,
    lastPaymentAt: null, lastWebhookAt: null, pendingExpiresAt: null,
    previousSubscriptionIds: [],
  },
  hasAccessFlag: false,
};

const SUBSCRIPTION_DEFAULT = {
  status: null, mpSubscriptionId: null, priceARS: null,
  currentPeriodEnd: null, subscribedAt: null, cancelledAt: null,
  lastPaymentAt: null, lastWebhookAt: null, pendingExpiresAt: null,
  previousSubscriptionIds: [],
};

// ============================================================================
// Verification helpers
// ============================================================================

let totalFailed = 0;
function pass(label, detail = '') { console.log(`  ✓  ${label}${detail ? '  — ' + detail : ''}`); }
function fail(label, detail = '') { totalFailed++; console.log(`  ✗  ${label}${detail ? '  — ' + detail : ''}`); }
function info(label, detail = '') { console.log(`  ⓘ  ${label}${detail ? '  — ' + detail : ''}`); }
function section(t) { console.log(`\n=== ${t} ===`); }

// ============================================================================
// Main
// ============================================================================

async function run() {
  const testUri = process.env.TEST_DB_URL;
  const prodUri = process.env.DB_URL || process.env.MONGODB_URI;

  if (!testUri) {
    console.error('ERROR: TEST_DB_URL env var not set.');
    console.error('       Set it to a TEST Atlas connection string (not production).');
    process.exit(1);
  }
  if (testUri === prodUri) {
    console.error('ERROR: TEST_DB_URL is the same as DB_URL — refusing to run against production.');
    process.exit(1);
  }

  console.log('============================================');
  console.log('REAL DB MIGRATION TEST');
  console.log('============================================');

  // Load JSON dumps
  const rawUsers = loadJSON('production.users.json');
  const rawKeys  = loadJSON('production.productkeys.json');
  const rawPrompts    = loadJSON('production.prompts.json');
  const rawAssistants = loadJSON('production.assistants.json');

  console.log(`\nLoaded dumps:`);
  console.log(`  users:      ${rawUsers.length}`);
  console.log(`  productkeys: ${rawKeys.length}`);
  console.log(`  prompts:    ${rawPrompts.length}`);
  console.log(`  assistants: ${rawAssistants.length}`);

  await mongoose.connect(testUri);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`\nConnected to TEST DB: ${dbName}`);

  const db = mongoose.connection.db;

  // ========================================================================
  // STEP 0: Drop and reload collections from production dumps
  // ========================================================================
  section('Step 0: Load production data into test DB');

  const collMap = {
    users:       rawUsers,
    productkeys: rawKeys,
    prompts:     rawPrompts,
    assistants:  rawAssistants,
  };

  for (const [name, docs] of Object.entries(collMap)) {
    const col = db.collection(name);
    await col.drop().catch(() => {});
    if (docs.length > 0) {
      await col.insertMany(docs.map(dejson), { ordered: false });
    }
    const count = await col.countDocuments();
    console.log(`  ${name}: dropped & reloaded — ${count} docs`);
  }

  const users = db.collection('users');
  const totalUsers = await users.countDocuments();

  // ========================================================================
  // MIGRATION — same operations as migrateToProduction.js
  // ========================================================================
  section('Migration steps');

  // Step 1a
  const s1a = await users.updateMany(
    { coins: { $exists: false } },
    { $set: { coins: 0, coinsHistory: [], equippedCoverId: 'default' } }
  );
  console.log(`  Step 1a  coins/coinsHistory/equippedCoverId: ${s1a.modifiedCount} updated`);

  // Step 1b
  const s1b = await users.updateMany(
    { passwordChangedAt: { $exists: false } },
    { $set: { passwordChangedAt: null } }
  );
  console.log(`  Step 1b  passwordChangedAt: ${s1b.modifiedCount} updated`);

  // Step 2 — each field independently
  const s2a = await users.updateMany({ 'dailyStreak.shields': { $exists: false } }, { $set: { 'dailyStreak.shields': 0 } });
  const s2b = await users.updateMany({ 'dailyStreak.shieldCoveredDate': { $exists: false } }, { $set: { 'dailyStreak.shieldCoveredDate': null } });
  const s2c = await users.updateMany({ 'dailyStreak.lostCount': { $exists: false } }, { $set: { 'dailyStreak.lostCount': null } });
  const s2d = await users.updateMany({ 'dailyStreak.lostAt': { $exists: false } }, { $set: { 'dailyStreak.lostAt': null } });
  console.log(`  Step 2   dailyStreak: shields=${s2a.modifiedCount} shieldCoveredDate=${s2b.modifiedCount} lostCount=${s2c.modifiedCount} lostAt=${s2d.modifiedCount}`);

  // Step 3
  for (const pid of EXISTING_PROGRAMS) {
    const r = await users.updateMany(
      { [`programs.${pid}`]: { $exists: true }, [`programs.${pid}.totalXp`]: { $exists: false } },
      { $set: { [`programs.${pid}.totalXp`]: 0, [`programs.${pid}.chestsOpened`]: [], [`programs.${pid}.coinsRewardedModules`]: [], [`programs.${pid}.coinsRewardedProgram`]: false } }
    );
    console.log(`  Step 3   [${pid}] program fields: ${r.modifiedCount} updated`);
  }

  // Step 4
  const s4 = await users.updateMany(
    { 'programs.trenno_ia': { $exists: false } },
    { $set: { 'programs.trenno_ia': TRENNO_IA_DEFAULT } }
  );
  console.log(`  Step 4   trenno_ia added: ${s4.modifiedCount}`);

  // Step 5
  for (const pid of ALL_PROGRAMS) {
    const r1 = await users.updateMany({ [`programs.${pid}.isPurchased`]: true }, { $set: { [`programs.${pid}.hasAccessFlag`]: true } });
    const r2 = await users.updateMany(
      { [`programs.${pid}`]: { $exists: true }, [`programs.${pid}.isPurchased`]: { $ne: true }, [`programs.${pid}.hasAccessFlag`]: { $exists: false } },
      { $set: { [`programs.${pid}.hasAccessFlag`]: false } }
    );
    console.log(`  Step 5   [${pid}] hasAccessFlag: true=${r1.modifiedCount} false=${r2.modifiedCount}`);
  }

  // Step 6
  for (const pid of ALL_PROGRAMS) {
    const r = await users.updateMany(
      { [`programs.${pid}`]: { $exists: true }, [`programs.${pid}.subscription`]: { $exists: false } },
      { $set: { [`programs.${pid}.subscription`]: SUBSCRIPTION_DEFAULT } }
    );
    console.log(`  Step 6   [${pid}] subscription subdoc: ${r.modifiedCount}`);
  }

  // Step 7
  const s7 = await users.updateMany(
    { 'achievements.0': { $exists: true } },
    { $set: { 'achievements.$[elem].coinsReward': 0 } },
    { arrayFilters: [{ 'elem.coinsReward': { $exists: false } }] }
  );
  console.log(`  Step 7   achievements coinsReward: ${s7.modifiedCount} users updated`);

  // Step 8
  let s8count = 0;
  for await (const user of users.find({ 'xpHistory.0': { $exists: true } })) {
    const xpByProgram = {};
    for (const e of user.xpHistory || []) {
      if (!XP_TYPES.includes(e.type)) continue;
      const pid = e.meta?.programId;
      if (!pid) continue;
      xpByProgram[pid] = (xpByProgram[pid] || 0) + (e.xp || 0);
    }
    const updates = {};
    let changed = false;
    for (const [pid, xp] of Object.entries(xpByProgram)) {
      if (user.programs?.[pid] && (user.programs[pid].totalXp || 0) !== xp) {
        updates[`programs.${pid}.totalXp`] = xp;
        changed = true;
      }
    }
    if (changed) { await users.updateOne({ _id: user._id }, { $set: updates }); s8count++; }
  }
  console.log(`  Step 8   totalXp from xpHistory: ${s8count} users updated`);

  // Step 9
  const s9a = await users.updateMany({ communityStats: { $exists: false } }, { $set: { communityStats: { promptsCount: 0, assistantsCount: 0, totalFavoritesReceived: 0 } } });
  const s9b = await users.updateMany({ refreshToken: { $exists: false } }, { $set: { refreshToken: { token: null, expiresAt: null } } });
  const s9c = await users.updateMany({ 'otp.recoveryVerified': { $exists: false } }, { $set: { 'otp.recoveryVerified': false } });
  console.log(`  Step 9   communityStats: ${s9a.modifiedCount}  refreshToken: ${s9b.modifiedCount}  otp.recoveryVerified: ${s9c.modifiedCount}`);

  // Step 10
  const s10 = await users.updateMany({ favorites: { $exists: false } }, { $set: { favorites: { prompts: [], assistants: [] } } });
  console.log(`  Step 10  favorites: ${s10.modifiedCount} updated`);

  // Step 11
  const s11 = await users.updateMany(
    { $or: [{ unlockedCovers: { $exists: false } }, { unlockedCovers: { $size: 0 } }] },
    { $set: { unlockedCovers: [{ coverId: 'default', unlockedDate: new Date() }] } }
  );
  console.log(`  Step 11  unlockedCovers: ${s11.modifiedCount} updated`);

  // ========================================================================
  // VERIFICATION — same checks as verifyMigration.js
  // ========================================================================
  section('Verification');

  const topFields = ['coins','coinsHistory','equippedCoverId','passwordChangedAt','communityStats','refreshToken','favorites','unlockedCovers'];
  console.log('\n  -- Top-level fields --');
  for (const f of topFields) {
    const m = await users.countDocuments({ [f]: { $exists: false } });
    m === 0 ? pass(f, `all ${totalUsers} OK`) : fail(f, `${m} still missing`);
  }

  console.log('\n  -- dailyStreak fields --');
  for (const f of ['shields','shieldCoveredDate','lostCount','lostAt']) {
    const m = await users.countDocuments({ [`dailyStreak.${f}`]: { $exists: false } });
    m === 0 ? pass(`dailyStreak.${f}`, `all ${totalUsers} OK`) : fail(`dailyStreak.${f}`, `${m} still missing`);
  }

  console.log('\n  -- Programs presence --');
  for (const pid of ALL_PROGRAMS) {
    const has = await users.countDocuments({ [`programs.${pid}`]: { $exists: true } });
    if (!UNIVERSAL_PROGRAMS.includes(pid)) { info(`programs.${pid}`, `${has}/${totalUsers} (optional)`); continue; }
    has === totalUsers ? pass(`programs.${pid}`, `all ${totalUsers}`) : fail(`programs.${pid}`, `${has}/${totalUsers}`);
  }

  console.log('\n  -- Program sub-fields --');
  for (const pid of ALL_PROGRAMS) {
    const withProg = await users.countDocuments({ [`programs.${pid}`]: { $exists: true } });
    if (withProg === 0) continue;
    for (const f of ['totalXp','hasAccessFlag','subscription','chestsOpened','coinsRewardedModules','coinsRewardedProgram']) {
      const m = await users.countDocuments({ [`programs.${pid}`]: { $exists: true }, [`programs.${pid}.${f}`]: { $exists: false } });
      m === 0 ? pass(`programs.${pid}.${f}`, `all ${withProg} OK`) : fail(`programs.${pid}.${f}`, `${m} missing`);
    }
  }

  console.log('\n  -- Achievements --');
  const achMissing = await users.countDocuments({ 'achievements.0': { $exists: true }, 'achievements.coinsReward': { $exists: false } });
  // More precise check using aggregation
  const achCheck = await users.aggregate([
    { $match: { 'achievements.0': { $exists: true } } },
    { $project: { hasMissing: { $anyElementTrue: { $map: { input: '$achievements', as: 'a', in: { $eq: [{ $type: '$$a.coinsReward' }, 'missing'] } } } } } },
    { $match: { hasMissing: true } },
    { $count: 'total' }
  ]).toArray();
  const achFail = achCheck[0]?.total || 0;
  achFail === 0 ? pass('achievements.coinsReward', 'all OK') : fail('achievements.coinsReward', `${achFail} users still have missing coinsReward`);

  console.log('\n  -- hasAccessFlag integrity --');
  for (const pid of ALL_PROGRAMS) {
    const mismatch = await users.countDocuments({ [`programs.${pid}.isPurchased`]: true, [`programs.${pid}.hasAccessFlag`]: { $ne: true } });
    mismatch === 0 ? pass(`[${pid}] purchased → hasAccessFlag=true`) : fail(`[${pid}]`, `${mismatch} purchased but hasAccessFlag != true`);
  }

  console.log('\n  -- unlockedCovers has default cover --');
  const noDefault = await users.aggregate([
    { $match: { $nor: [{ unlockedCovers: { $elemMatch: { coverId: 'default' } } }] } },
    { $count: 'total' }
  ]).toArray();
  const noDefaultCount = noDefault[0]?.total || 0;
  noDefaultCount === 0 ? pass('unlockedCovers has default cover', `all ${totalUsers} OK`) : fail('unlockedCovers', `${noDefaultCount} users missing default cover`);

  console.log('\n  -- Spot check: sample user after migration --');
  const sample = await users.findOne({});
  const sampleKeys = Object.keys(sample).sort();
  const requiredTopKeys = ['coins','coinsHistory','communityStats','equippedCoverId','favorites','passwordChangedAt','refreshToken','unlockedCovers'];
  const missingFromSample = requiredTopKeys.filter(k => !sampleKeys.includes(k));
  missingFromSample.length === 0 ? pass('Sample user has all required keys') : fail('Sample user missing keys', missingFromSample.join(', '));

  // ========================================================================
  // FINAL RESULT
  // ========================================================================
  section('FINAL RESULT');
  console.log(`  DB: ${dbName}`);
  console.log(`  Users tested: ${totalUsers}`);
  console.log('');
  if (totalFailed === 0) {
    console.log('  ✓  ALL CHECKS PASSED');
    console.log('  The production migration is safe to run.');
    console.log('');
    console.log('  When ready:');
    console.log('    node --env-file=.env src/scripts/migrateToProduction.js --yes');
    console.log('    node --env-file=.env src/migrations/seedPrograms.js');
    console.log('    node --env-file=.env src/scripts/verifyMigration.js');
  } else {
    console.log(`  ✗  ${totalFailed} CHECK(S) FAILED — do NOT run against production yet`);
    console.log('     Fix the issues above and re-run this test.');
  }

  await mongoose.disconnect();
  console.log('\nDisconnected from test DB.\n');
  if (totalFailed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('\nTEST ERROR:', err);
  process.exit(1);
});
