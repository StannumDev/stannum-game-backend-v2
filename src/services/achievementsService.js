const achievementsConfig = require('../config/achievementsConfig');

async function checkAndAddAchievements(user) {
    if (!user) throw new Error("USER_NOT_FOUND");

    const newlyUnlocked = [];
    const unlockedIds = new Set(user.achievements.map(a => a.achievementId));
    const lockedAchievements = achievementsConfig.filter(a => !unlockedIds.has(a.id));

    for (const achievement of lockedAchievements) {
        if (achievement.condition(user)) {
            const newAchievement = { achievementId: achievement.id, unlockedAt: new Date() };
            user.achievements.push(newAchievement);
            newlyUnlocked.push(newAchievement);
        }
    }

    return newlyUnlocked;
}

module.exports = { checkAndAddAchievements };