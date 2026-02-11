const achievementsConfig = require('../config/achievementsConfig');
const { nextLevelTarget, computeLevelProgress } = require('../helpers/experienceHelper');
const xpCfg = require('../config/xpConfig');

const checkAndAddAchievements = async (user) => {
    if (!user) throw new Error("USER_NOT_FOUND");

    const newlyUnlocked = [];
    const unlockedIds = new Set(user.achievements.map(a => a.achievementId));
    const lockedAchievements = achievementsConfig.filter(a => !unlockedIds.has(a.id));

    for (const achievement of lockedAchievements) {
        if (achievement.condition(user)) {
            const newAchievement = { achievementId: achievement.id, unlockedAt: new Date(), xpReward: achievement.xpReward || 0 };
            user.achievements.push(newAchievement);
            newlyUnlocked.push(newAchievement);
        }
    }

    return newlyUnlocked;
};

const unlockAchievements = async (user, save = false) => {
    if (!user) throw new Error('USER_NOT_FOUND');

    let newlyUnlocked = [];
    let pending = true;

    while (pending) {
        const unlocked = await checkAndAddAchievements(user);
        if (!unlocked.length) break;

        newlyUnlocked.push(...unlocked);

        for (const ach of unlocked) {
            if (ach.xpReward) {
                user.level.experienceTotal += ach.xpReward;
                user.xpHistory.push({ type: 'ACHIEVEMENT_UNLOCKED', xp: ach.xpReward, meta: { achievementId: ach.achievementId } });
            }
        }

        while (user.level.experienceTotal >= user.level.experienceNextLevel) {
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
