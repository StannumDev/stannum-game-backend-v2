/**
 * ============================================================================
 * SIMULATE MIGRATION — dry-run against production JSON dumps
 * ============================================================================
 *
 * Applies the same logic as migrateToProduction.js entirely in memory
 * against the production JSON export files. Does NOT connect to any database.
 *
 * Outputs:
 *   - Before/after field counts for every migration step
 *   - Full verification of the migrated data
 *   - A sample migrated user (anonymised)
 *
 * Usage:
 *   node src/scripts/simulateMigration.js
 *
 * Required files in the project root:
 *   production.users.json
 *   production.productkeys.json
 *   production.prompts.json
 *   production.assistants.json
 */

'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

function load(filename) {
  try {
    return require(path.join(ROOT, filename));
  } catch {
    console.warn(`  WARNING: ${filename} not found — skipping`);
    return [];
  }
}

// ============================================================================
// Helpers
// ============================================================================

function missing(users, field) {
  const parts = field.split('.');
  return users.filter((u) => {
    let cur = u;
    for (const p of parts) {
      if (cur === undefined || cur === null || !Object.prototype.hasOwnProperty.call(cur, p)) return true;
      cur = cur[p];
    }
    return false;
  }).length;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let totalFailed = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}${detail ? '  — ' + detail : ''}`);
  } else {
    totalFailed++;
    console.log(`  ✗  ${label}${detail ? '  — ' + detail : ''}`);
  }
}

// ============================================================================
// Migration logic (mirrors migrateToProduction.js exactly)
// ============================================================================

const ALL_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia'];
const EXISTING_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool'];
const XP_TYPES = ['LESSON_COMPLETED', 'INSTRUCTION_GRADED'];

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
  status: null, mpSubscriptionId: null, priceARS: null,
  currentPeriodEnd: null, subscribedAt: null, cancelledAt: null,
  lastPaymentAt: null, lastWebhookAt: null, pendingExpiresAt: null,
  previousSubscriptionIds: [],
};

function applyMigration(users) {
  const stats = {};

  // STEP 1: coins, coinsHistory, equippedCoverId + passwordChangedAt (independent)
  let s1a = 0, s1b = 0;
  for (const u of users) {
    if (u.coins === undefined) {
      u.coins = 0;
      u.coinsHistory = [];
      u.equippedCoverId = 'default';
      s1a++;
    }
    if (u.passwordChangedAt === undefined) {
      u.passwordChangedAt = null;
      s1b++;
    }
  }
  stats['step1_coins_coinsHistory_equippedCoverId'] = s1a;
  stats['step1_passwordChangedAt'] = s1b;

  // STEP 2: dailyStreak fields — each checked independently
  let s2a = 0, s2b = 0, s2c = 0, s2d = 0;
  for (const u of users) {
    if (!u.dailyStreak) u.dailyStreak = {};
    if (u.dailyStreak.shields === undefined) { u.dailyStreak.shields = 0; s2a++; }
    if (u.dailyStreak.shieldCoveredDate === undefined) { u.dailyStreak.shieldCoveredDate = null; s2b++; }
    if (u.dailyStreak.lostCount === undefined) { u.dailyStreak.lostCount = null; s2c++; }
    if (u.dailyStreak.lostAt === undefined) { u.dailyStreak.lostAt = null; s2d++; }
  }
  stats['step2_dailyStreak'] = { shields: s2a, shieldCoveredDate: s2b, lostCount: s2c, lostAt: s2d };

  // STEP 3: program fields
  const s3 = {};
  for (const pid of EXISTING_PROGRAMS) {
    let count = 0;
    for (const u of users) {
      const prog = u.programs?.[pid];
      if (prog && prog.totalXp === undefined) {
        prog.totalXp = 0;
        prog.chestsOpened = [];
        prog.coinsRewardedModules = [];
        prog.coinsRewardedProgram = false;
        count++;
      }
    }
    s3[pid] = count;
  }
  stats['step3_program_fields'] = s3;

  // STEP 4: trenno_ia
  let s4 = 0;
  for (const u of users) {
    if (!u.programs) u.programs = {};
    if (u.programs.trenno_ia === undefined) {
      u.programs.trenno_ia = deepClone(TRENNO_IA_DEFAULT);
      s4++;
    }
  }
  stats['step4_trenno_ia_added'] = s4;

  // STEP 5: hasAccessFlag
  const s5 = {};
  for (const pid of ALL_PROGRAMS) {
    let trueCount = 0, falseCount = 0;
    for (const u of users) {
      const prog = u.programs?.[pid];
      if (!prog) continue;
      if (prog.isPurchased === true) {
        prog.hasAccessFlag = true;
        trueCount++;
      } else if (prog.hasAccessFlag === undefined) {
        prog.hasAccessFlag = false;
        falseCount++;
      }
    }
    s5[pid] = { true: trueCount, false: falseCount };
  }
  stats['step5_hasAccessFlag'] = s5;

  // STEP 6: subscription subdoc
  const s6 = {};
  for (const pid of ALL_PROGRAMS) {
    let count = 0;
    for (const u of users) {
      const prog = u.programs?.[pid];
      if (prog && prog.subscription === undefined) {
        prog.subscription = deepClone(SUBSCRIPTION_DEFAULT);
        count++;
      }
    }
    s6[pid] = count;
  }
  stats['step6_subscription_subdoc'] = s6;

  // STEP 7: achievements coinsReward
  let s7 = 0;
  for (const u of users) {
    if (!u.achievements?.length) continue;
    let changed = false;
    for (const a of u.achievements) {
      if (a.coinsReward === undefined) {
        a.coinsReward = 0;
        changed = true;
      }
    }
    if (changed) s7++;
  }
  stats['step7_achievements_coinsReward'] = s7;

  // STEP 8: compute totalXp from xpHistory
  let s8 = 0;
  for (const u of users) {
    if (!u.xpHistory?.length) continue;
    const xpByProgram = {};
    for (const entry of u.xpHistory) {
      if (!XP_TYPES.includes(entry.type)) continue;
      const progId = entry.meta?.programId;
      if (!progId) continue;
      xpByProgram[progId] = (xpByProgram[progId] || 0) + (entry.xp || 0);
    }
    let changed = false;
    for (const [progId, totalXp] of Object.entries(xpByProgram)) {
      if (u.programs?.[progId]) {
        if ((u.programs[progId].totalXp || 0) !== totalXp) {
          u.programs[progId].totalXp = totalXp;
          changed = true;
        }
      }
    }
    if (changed) s8++;
  }
  stats['step8_totalXp_computed'] = s8;

  // STEP 9: communityStats, refreshToken, otp.recoveryVerified
  let s9a = 0, s9b = 0, s9c = 0;
  for (const u of users) {
    if (u.communityStats === undefined) {
      u.communityStats = { promptsCount: 0, assistantsCount: 0, totalFavoritesReceived: 0 };
      s9a++;
    }
    if (u.refreshToken === undefined) {
      u.refreshToken = { token: null, expiresAt: null };
      s9b++;
    }
    if (!u.otp) u.otp = {};
    if (u.otp.recoveryVerified === undefined) {
      u.otp.recoveryVerified = false;
      s9c++;
    }
  }
  stats['step9_communityStats'] = s9a;
  stats['step9_refreshToken'] = s9b;
  stats['step9_otp_recoveryVerified'] = s9c;

  // STEP 10: favorites
  let s10 = 0;
  for (const u of users) {
    if (u.favorites === undefined) {
      u.favorites = { prompts: [], assistants: [] };
      s10++;
    }
  }
  stats['step10_favorites'] = s10;

  // STEP 11: unlockedCovers (handles missing AND empty array)
  let s11 = 0;
  for (const u of users) {
    if (u.unlockedCovers === undefined || u.unlockedCovers.length === 0) {
      u.unlockedCovers = [{ coverId: 'default', unlockedDate: new Date().toISOString() }];
      s11++;
    }
  }
  stats['step11_unlockedCovers'] = s11;

  return stats;
}

// ============================================================================
// Verification (mirrors verifyMigration.js exactly)
// ============================================================================

function verify(users) {
  console.log('\n============================================');
  console.log('POST-MIGRATION VERIFICATION');
  console.log('============================================');
  const total = users.length;

  const topFields = [
    'coins', 'coinsHistory', 'equippedCoverId', 'passwordChangedAt',
    'communityStats', 'refreshToken', 'favorites', 'unlockedCovers',
  ];
  console.log('\n--- Top-level fields ---');
  for (const f of topFields) {
    const m = missing(users, f);
    check(f, m === 0, m > 0 ? `${m}/${total} still missing` : `all ${total} OK`);
  }

  console.log('\n--- dailyStreak sub-fields ---');
  for (const f of ['shields', 'shieldCoveredDate', 'lostCount', 'lostAt']) {
    const m = missing(users, `dailyStreak.${f}`);
    check(`dailyStreak.${f}`, m === 0, m > 0 ? `${m}/${total} still missing` : `all ${total} OK`);
  }

  console.log('\n--- Programs presence ---');
  // tia/tmd/tia_summer/trenno_ia are universal; tia_pool is optional (only some users)
  const UNIVERSAL_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'trenno_ia'];
  for (const pid of ALL_PROGRAMS) {
    const has = users.filter((u) => u.programs?.[pid] !== undefined).length;
    if (UNIVERSAL_PROGRAMS.includes(pid)) {
      check(`programs.${pid}`, has === total, `${has}/${total}`);
    } else {
      console.log(`  ⓘ  programs.${pid}  — ${has}/${total} (optional, not all users need it)`);
    }
  }

  console.log('\n--- Program sub-fields ---');
  for (const pid of ALL_PROGRAMS) {
    const withProg = users.filter((u) => u.programs?.[pid] !== undefined);
    for (const f of ['totalXp', 'hasAccessFlag', 'subscription', 'chestsOpened', 'coinsRewardedModules', 'coinsRewardedProgram']) {
      const m = withProg.filter((u) => u.programs[pid][f] === undefined).length;
      check(`programs.${pid}.${f}`, m === 0, m > 0 ? `${m} missing` : `all ${withProg.length} OK`);
    }
  }

  console.log('\n--- Achievements ---');
  const withAch = users.filter((u) => u.achievements?.length > 0);
  const achMissing = withAch.filter((u) => u.achievements.some((a) => a.coinsReward === undefined)).length;
  check('achievements.coinsReward', achMissing === 0, `${withAch.length} users with achievements`);

  console.log('\n--- hasAccessFlag integrity ---');
  for (const pid of ALL_PROGRAMS) {
    const mismatch = users.filter(
      (u) => u.programs?.[pid]?.isPurchased === true && u.programs[pid].hasAccessFlag !== true
    ).length;
    check(`[${pid}] purchased → hasAccessFlag=true`, mismatch === 0, mismatch > 0 ? `${mismatch} mismatches` : '');
  }

  console.log('\n--- unlockedCovers has default cover ---');
  const noDefault = users.filter(
    (u) => !u.unlockedCovers?.some((c) => c.coverId === 'default')
  ).length;
  check('unlockedCovers has default cover', noDefault === 0, noDefault > 0 ? `${noDefault} users missing default` : `all ${total} OK`);
}

// ============================================================================
// Main
// ============================================================================

console.log('============================================');
console.log('MIGRATION SIMULATION (dry-run, no DB)');
console.log('============================================\n');

const rawUsers = load('production.users.json');
const productKeys = load('production.productkeys.json');
const prompts = load('production.prompts.json');
const assistants = load('production.assistants.json');

console.log(`Loaded: ${rawUsers.length} users, ${productKeys.length} product keys, ${prompts.length} prompts, ${assistants.length} assistants`);

// ---- BEFORE snapshot ----
console.log('\n============================================');
console.log('BEFORE MIGRATION');
console.log('============================================');
const before = [
  ['coins', rawUsers.filter((u) => u.coins === undefined).length],
  ['coinsHistory', rawUsers.filter((u) => u.coinsHistory === undefined).length],
  ['equippedCoverId', rawUsers.filter((u) => u.equippedCoverId === undefined).length],
  ['communityStats', rawUsers.filter((u) => u.communityStats === undefined).length],
  ['refreshToken', rawUsers.filter((u) => u.refreshToken === undefined).length],
  ['favorites', rawUsers.filter((u) => u.favorites === undefined).length],
  ['unlockedCovers (empty/missing)', rawUsers.filter((u) => !u.unlockedCovers?.length).length],
  ['programs.trenno_ia', rawUsers.filter((u) => u.programs?.trenno_ia === undefined).length],
  ['programs.tia_pool', rawUsers.filter((u) => u.programs?.tia_pool === undefined).length],
  ['dailyStreak.shields', rawUsers.filter((u) => u.dailyStreak?.shields === undefined).length],
  ['achievements.coinsReward (users)', rawUsers.filter((u) => u.achievements?.some((a) => a.coinsReward === undefined)).length],
];

for (const [label, count] of before) {
  const pct = ((count / rawUsers.length) * 100).toFixed(1);
  console.log(`  ${String(count).padStart(4)} / ${rawUsers.length}  (${pct.padStart(5)}%)  missing: ${label}`);
}

// ---- Run migration in memory ----
const users = deepClone(rawUsers);
const stats = applyMigration(users);

// ---- Step-by-step output ----
console.log('\n============================================');
console.log('MIGRATION STEPS');
console.log('============================================');
console.log(`\nStep 1  — coins/coinsHistory/equippedCoverId: ${stats.step1_coins_coinsHistory_equippedCoverId} users updated`);
console.log(`Step 1b — passwordChangedAt: ${stats.step1_passwordChangedAt} users updated`);
console.log(`Step 2  — dailyStreak: shields=${stats.step2_dailyStreak.shields}  shieldCoveredDate=${stats.step2_dailyStreak.shieldCoveredDate}  lostCount=${stats.step2_dailyStreak.lostCount}  lostAt=${stats.step2_dailyStreak.lostAt}`);
console.log('Step 3  — existing program sub-fields:');
for (const [pid, count] of Object.entries(stats.step3_program_fields)) {
  console.log(`           [${pid}]  ${count} users updated`);
}
console.log(`Step 4  — trenno_ia added:  ${stats.step4_trenno_ia_added} users`);
console.log('Step 5  — hasAccessFlag:');
for (const [pid, counts] of Object.entries(stats.step5_hasAccessFlag)) {
  console.log(`           [${pid}]  set=true: ${counts.true}  set=false: ${counts.false}`);
}
console.log('Step 6  — subscription subdoc:');
for (const [pid, count] of Object.entries(stats.step6_subscription_subdoc)) {
  console.log(`           [${pid}]  ${count} users`);
}
console.log(`Step 7  — achievements coinsReward:  ${stats.step7_achievements_coinsReward} users updated`);
console.log(`Step 8  — totalXp from xpHistory:  ${stats.step8_totalXp_computed} users updated`);
console.log(`Step 9  — communityStats: ${stats.step9_communityStats}  refreshToken: ${stats.step9_refreshToken}  otp.recoveryVerified: ${stats.step9_otp_recoveryVerified}`);
console.log(`Step 10 — favorites:  ${stats.step10_favorites} users updated`);
console.log(`Step 11 — unlockedCovers:  ${stats.step11_unlockedCovers} users updated`);

// ---- Verify result ----
verify(users);

// ---- Sample anonymised user after migration ----
console.log('\n============================================');
console.log('SAMPLE MIGRATED USER (first user, anonymised)');
console.log('============================================');
if (!users.length) { console.log('  (no users loaded)'); process.exit(totalFailed > 0 ? 1 : 0); }
const sample = deepClone(users[0]);
sample.email = '***@***.com';
sample.username = '***';
sample.password = '***';
if (sample.otp) sample.otp = { recoveryVerified: sample.otp.recoveryVerified };
if (sample.refreshToken) sample.refreshToken = { token: null, expiresAt: null };
// Trim arrays to keep output readable
if (sample.xpHistory?.length > 2) sample.xpHistory = [...sample.xpHistory.slice(0, 2), `... (${sample.xpHistory.length} total)`];
if (sample.coinsHistory?.length > 2) sample.coinsHistory = [...sample.coinsHistory.slice(0, 2), `... (${sample.coinsHistory.length} total)`];
if (sample.achievements?.length > 2) sample.achievements = [...sample.achievements.slice(0, 2), `... (${sample.achievements.length} total)`];
console.log(JSON.stringify(sample, null, 2));

// ---- Final result ----
console.log('\n============================================');
if (totalFailed === 0) {
  console.log('SIMULATION PASSED — migration is safe to run');
} else {
  console.log(`SIMULATION FAILED — ${totalFailed} check(s) would fail after migration`);
}
console.log('============================================\n');

if (totalFailed > 0) process.exit(1);
