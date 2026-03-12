const achievementsConfig = require('../config/achievementsConfig');
const { nextLevelTarget, computeLevelProgress } = require('../helpers/experienceHelper');
const xpCfg = require('../config/xpConfig');
const { grantCoins } = require('./coinsService');

const enrichCommunityStats = async (user) => {
    try {
        const Prompt = require('../models/promptModel');
        const Assistant = require('../models/assistantModel');
        const userId = user._id || user.id;

        const [promptsCount, assistantsCount, promptFavorites, assistantFavorites] = await Promise.all([
            Prompt.countDocuments({ author: userId, status: true }),
            Assistant.countDocuments({ author: userId, status: true }),
            Prompt.aggregate([
                { $match: { author: userId, status: true } },
                { $group: { _id: null, total: { $sum: '$metrics.favoritesCount' } } }
            ]),
            Assistant.aggregate([
                { $match: { author: userId, status: true } },
                { $group: { _id: null, total: { $sum: '$metrics.favoritesCount' } } }
            ]),
        ]);

        const stats = {
            promptsCount,
            assistantsCount,
            totalFavoritesReceived: (promptFavorites[0]?.total || 0) + (assistantFavorites[0]?.total || 0),
        };

        // Persist cache on the document and expose for in-memory condition checks
        user.communityStats = stats;
        user._communityStats = stats;
    } catch (err) {
        console.error('[Achievements] enrichCommunityStats failed, using cached data:', err.message);
        // Fall back to persisted cache — do NOT overwrite with zeros on error
        user._communityStats = {
            promptsCount: user.communityStats?.promptsCount || 0,
            assistantsCount: user.communityStats?.assistantsCount || 0,
            totalFavoritesReceived: user.communityStats?.totalFavoritesReceived || 0,
        };
    }
};

const checkAndAddAchievements = async (user) => {
    if (!user) throw new Error("USER_NOT_FOUND");

    const newlyUnlocked = [];
    const unlockedIds = new Set((user.achievements || []).map(a => a.achievementId));
    const lockedAchievements = achievementsConfig.filter(a => !unlockedIds.has(a.id));

    for (const achievement of lockedAchievements) {
        try {
            if (achievement.condition(user)) {
                const newAchievement = { achievementId: achievement.id, unlockedAt: new Date(), xpReward: achievement.xpReward || 0, coinsReward: achievement.coinsReward || 0 };
                user.achievements.push(newAchievement);
                newlyUnlocked.push(newAchievement);
            }
        } catch (err) {
            console.error(`[Achievements] Error checking condition for ${achievement.id}:`, err.message);
        }
    }

    return newlyUnlocked;
};

const unlockAchievements = async (user, save = false) => {
    if (!user) throw new Error('USER_NOT_FOUND');

    await enrichCommunityStats(user);

    let newlyUnlocked = [];
    let iterations = 0;

    while (iterations < 10) {
        iterations++;
        const unlocked = await checkAndAddAchievements(user);
        if (!unlocked.length) break;

        newlyUnlocked.push(...unlocked);

        for (const ach of unlocked) {
            if (ach.xpReward) {
                user.level.experienceTotal += ach.xpReward;
                user.xpHistory.push({ type: 'ACHIEVEMENT_UNLOCKED', xp: ach.xpReward, meta: { achievementId: ach.achievementId } });
            }
            if (ach.coinsReward) {
                grantCoins(user, 'ACHIEVEMENT_UNLOCKED', ach.coinsReward, { achievementId: ach.achievementId });
            }
        }

        while (user.level.experienceTotal >= user.level.experienceNextLevel && user.level.currentLevel < xpCfg.LEVELS.MAX_LEVEL) {
            user.level.currentLevel += 1;
            user.level.experienceCurrentLevel = user.level.experienceNextLevel;
            user.level.experienceNextLevel = nextLevelTarget(user.level.currentLevel, user.level.experienceCurrentLevel, xpCfg);
        }
        user.level.progress = computeLevelProgress(user.level);
    }

    if (save && newlyUnlocked.length) await user.save();

    return { newlyUnlocked };
};

module.exports = { checkAndAddAchievements, unlockAchievements };
