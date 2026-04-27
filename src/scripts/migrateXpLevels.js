'use strict';

/**
 * Recomputes level.currentLevel, experienceCurrentLevel, experienceNextLevel,
 * and progress for every user based on their existing experienceTotal and the
 * NEW xpConfig levelling formula.
 *
 * Safe to run multiple times — always recomputes from experienceTotal.
 *
 * Usage:
 *   node --env-file=.env src/scripts/migrateXpLevels.js
 */

const mongoose = require('mongoose');
const xpCfg = require('../config/xpConfig');

const MAX_LEVEL = xpCfg.LEVELS.MAX_LEVEL;

const nextLevelTarget = (currentLevel, experienceCurrentLevel) => {
    const { base, tiers } = xpCfg.LEVELS;
    let cost = base;
    for (let lvl = 3; lvl <= currentLevel + 1; lvl++) {
        const tier = tiers.find(t => lvl <= t.upToLevel) || tiers[tiers.length - 1];
        cost += tier.increment;
    }
    return experienceCurrentLevel + cost;
};

const computeLevel = (experienceTotal) => {
    let currentLevel = 1;
    let experienceCurrentLevel = 0;
    let experienceNextLevel = nextLevelTarget(1, 0);

    while (experienceTotal >= experienceNextLevel && currentLevel < MAX_LEVEL) {
        currentLevel += 1;
        experienceCurrentLevel = experienceNextLevel;
        experienceNextLevel = nextLevelTarget(currentLevel, experienceCurrentLevel);
    }

    const span = experienceNextLevel - experienceCurrentLevel;
    const progress = span > 0
        ? Math.round(((experienceTotal - experienceCurrentLevel) / span) * 100)
        : 100;

    return { currentLevel, experienceCurrentLevel, experienceNextLevel, progress: Math.min(progress, 100) };
};

async function run() {
    const uri = process.env.DB_URL || process.env.MONGODB_URI;
    if (!uri) { console.error('ERROR: DB_URL not set'); process.exit(1); }

    await mongoose.connect(uri);
    const dbName = mongoose.connection.db.databaseName;
    console.log(`Connected to MongoDB (db: ${dbName})\n`);

    const users = mongoose.connection.db.collection('users');
    const total = await users.countDocuments();
    console.log(`Total users: ${total}`);

    const cursor = users.find({}, { projection: { _id: 1, 'level.experienceTotal': 1, 'level.currentLevel': 1 } });

    let updated = 0;
    let skipped = 0;
    const levelDist = {};

    for await (const user of cursor) {
        const experienceTotal = user.level?.experienceTotal || 0;
        const { currentLevel, experienceCurrentLevel, experienceNextLevel, progress } = computeLevel(experienceTotal);

        levelDist[currentLevel] = (levelDist[currentLevel] || 0) + 1;

        const oldLevel = user.level?.currentLevel || 1;
        if (oldLevel === currentLevel) { skipped++; continue; }

        await users.updateOne({ _id: user._id }, {
            $set: {
                'level.currentLevel': currentLevel,
                'level.experienceCurrentLevel': experienceCurrentLevel,
                'level.experienceNextLevel': experienceNextLevel,
                'level.progress': progress,
            }
        });
        updated++;
    }

    console.log(`\nUpdated: ${updated} users`);
    console.log(`Unchanged: ${skipped} users`);
    console.log('\nLevel distribution after migration:');
    Object.keys(levelDist).sort((a, b) => +a - +b).forEach(lvl => {
        console.log(`  Level ${lvl}: ${levelDist[lvl]} users`);
    });

    await mongoose.disconnect();
    console.log('\nDone.');
}

run().catch(err => { console.error('\nFAILED:', err); process.exit(1); });
