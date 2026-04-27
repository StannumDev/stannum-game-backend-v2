'use strict';

/**
 * Backfills tins (coins) for users who were migrated to production with coins=0.
 * Computes coins from existing user state:
 *   - LESSON_COMPLETED: 5 per lesson
 *   - INSTRUCTION_GRADED: by score (10/15/20/25)
 *   - MODULE_COMPLETED: 30 per fully-completed module
 *   - PROGRAM_COMPLETED: 100 per fully-completed program
 *   - DAILY_STREAK_BONUS: from xpHistory using DAILY_STREAK_PER_DAY
 *   - ACHIEVEMENT_UNLOCKED: coinsReward from achievementsConfig per unlocked achievement
 *
 * Skips users with coins > 0 OR coinsHistory entries (already earned post-migration).
 *
 * Also updates `achievements[].coinsReward` to match achievementsConfig.
 *
 * Usage:
 *   node --env-file=.env src/scripts/migrateBackfillCoins.js          # dry-run
 *   node --env-file=.env src/scripts/migrateBackfillCoins.js --apply  # commit
 */

const mongoose = require('mongoose');
const coinsCfg = require('../config/coinsConfig');
const achievementsCfg = require('../config/achievementsConfig');

const APPLY = process.argv.includes('--apply');

const flat = (p) => (p.sections || []).flatMap(s => s.modules || []);

const computeInstructionCoins = (score) => {
    if (score === 100) return coinsCfg.INSTRUCTION_GRADED.PERFECT;
    if (score >= 90) return coinsCfg.INSTRUCTION_GRADED.FROM_90;
    if (score >= 70) return coinsCfg.INSTRUCTION_GRADED.FROM_70;
    return coinsCfg.INSTRUCTION_GRADED.BELOW_70;
};

const achievementCoinsById = Object.fromEntries(
    achievementsCfg.map(a => [a.id, a.coinsReward || 0])
);

const computeUserCoins = (user, programsConfig) => {
    const breakdown = {
        lessons: 0,
        instructions: 0,
        modules: 0,
        programs: 0,
        streak: 0,
        achievements: 0,
    };

    const programs = user.programs || {};

    for (const [pid, userProg] of Object.entries(programs)) {
        if (!userProg) continue;

        // lessons
        const lessonsCount = (userProg.lessonsCompleted || []).length;
        breakdown.lessons += lessonsCount * coinsCfg.LESSON_COMPLETED;

        // instructions
        for (const inst of (userProg.instructions || [])) {
            if (inst.status === 'GRADED') {
                breakdown.instructions += computeInstructionCoins(inst.score || 0);
            }
        }

        // modules + program completion (requires program config)
        const programCfg = programsConfig.find(p => p.id === pid);
        if (!programCfg) continue;

        const modules = flat(programCfg);
        let allModulesDone = modules.length > 0;

        for (const module of modules) {
            const allLessonsDone = (module.lessons || []).every(lesson =>
                (userProg.lessonsCompleted || []).some(l => l.lessonId === lesson.id)
            );
            const allInstructionsDone = (module.instructions || []).every(inst =>
                (userProg.instructions || []).some(i => i.instructionId === inst.id && i.status === 'GRADED')
            );
            const moduleDone = allLessonsDone && allInstructionsDone && (module.lessons || []).length > 0;

            if (moduleDone) breakdown.modules += coinsCfg.MODULE_COMPLETED;
            else allModulesDone = false;
        }

        if (allModulesDone) breakdown.programs += coinsCfg.PROGRAM_COMPLETED;
    }

    // streak bonuses (from xpHistory)
    for (const event of (user.xpHistory || [])) {
        if (event.type === 'DAILY_STREAK_BONUS') {
            const day = event.meta?.day || 0;
            const idx = Math.min(day - 1, coinsCfg.DAILY_STREAK_CAP_DAY - 1);
            if (idx >= 0 && idx < coinsCfg.DAILY_STREAK_PER_DAY.length) {
                breakdown.streak += coinsCfg.DAILY_STREAK_PER_DAY[idx];
            }
        }
    }

    // achievements
    for (const ach of (user.achievements || [])) {
        breakdown.achievements += achievementCoinsById[ach.achievementId] || 0;
    }

    const total = breakdown.lessons + breakdown.instructions + breakdown.modules
                + breakdown.programs + breakdown.streak + breakdown.achievements;

    return { total, breakdown };
};

async function run() {
    const uri = process.env.DB_URL;
    if (!uri) { console.error('DB_URL not set'); process.exit(1); }

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    console.log(`Connected (db: ${db.databaseName}) | mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

    const users = db.collection('users');
    const programsCol = db.collection('programs');
    const programsConfig = await programsCol.find({}).toArray();
    console.log(`Programs loaded: ${programsConfig.map(p => p.id).join(', ')}\n`);

    const cursor = users.find({});
    let processed = 0;
    let skipped = 0;
    let updated = 0;
    let totalCoinsAwarded = 0;
    const aggBreakdown = { lessons: 0, instructions: 0, modules: 0, programs: 0, streak: 0, achievements: 0 };
    const distribution = { 0: 0, '1-50': 0, '51-200': 0, '201-500': 0, '501-1000': 0, '1001+': 0 };

    for await (const user of cursor) {
        processed++;

        // Skip if user already has coins or coinsHistory (post-migration activity)
        if ((user.coins || 0) > 0 || (user.coinsHistory || []).length > 0) {
            skipped++;
            continue;
        }

        const { total, breakdown } = computeUserCoins(user, programsConfig);

        // Update aggregates
        for (const k of Object.keys(aggBreakdown)) aggBreakdown[k] += breakdown[k];
        totalCoinsAwarded += total;

        if (total === 0) distribution[0]++;
        else if (total <= 50) distribution['1-50']++;
        else if (total <= 200) distribution['51-200']++;
        else if (total <= 500) distribution['201-500']++;
        else if (total <= 1000) distribution['501-1000']++;
        else distribution['1001+']++;

        if (APPLY && total > 0) {
            // Build achievements with corrected coinsReward
            const updatedAchievements = (user.achievements || []).map(a => ({
                ...a,
                coinsReward: achievementCoinsById[a.achievementId] || 0,
            }));

            await users.updateOne({ _id: user._id }, {
                $set: {
                    coins: total,
                    coinsHistory: [{
                        type: 'MIGRATION_BACKFILL',
                        coins: total,
                        date: new Date(),
                        meta: breakdown,
                    }],
                    achievements: updatedAchievements,
                },
            });
            updated++;
        } else if (APPLY) {
            // total === 0 but still update achievement coinsReward field
            const updatedAchievements = (user.achievements || []).map(a => ({
                ...a,
                coinsReward: achievementCoinsById[a.achievementId] || 0,
            }));
            if (updatedAchievements.length > 0) {
                await users.updateOne({ _id: user._id }, { $set: { achievements: updatedAchievements } });
            }
        }
    }

    console.log('===== SUMMARY =====');
    console.log(`Processed: ${processed}`);
    console.log(`Skipped (already has coins/history): ${skipped}`);
    console.log(`Eligible for backfill: ${processed - skipped}`);
    if (APPLY) console.log(`Updated: ${updated}`);
    console.log(`Total coins to award: ${totalCoinsAwarded}`);
    console.log(`Avg per eligible user: ${Math.round(totalCoinsAwarded / Math.max(1, processed - skipped))}`);
    console.log('\nBreakdown by source:');
    Object.entries(aggBreakdown).forEach(([k, v]) => console.log(`  ${k.padEnd(15)}: ${v}`));
    console.log('\nDistribution:');
    Object.entries(distribution).forEach(([range, count]) => console.log(`  ${range.padEnd(10)}: ${count} users`));

    await mongoose.disconnect();
    console.log(`\n${APPLY ? 'APPLIED.' : 'DRY-RUN complete. Re-run with --apply to commit.'}`);
}

run().catch(err => { console.error('FAILED:', err); process.exit(1); });
