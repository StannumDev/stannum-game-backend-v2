const { nextLevelTarget, localTodayString, isSameLocalDay, isConsecutiveLocalDay, computeInstructionXP, computeLessonXP, computeLevelProgress } = require('../helpers/experienceHelper');
const { resolveLessonInfo } = require('../helpers/resolveLessonInfo');
const xpCfg = require('../config/xpConfig');
const coinsCfg = require('../config/coinsConfig');
const { unlockAchievements } = require('./achievementsService');
const { grantCoins, trimCoinsHistory, computeInstructionCoins } = require('./coinsService');
const { isModuleCompleted, isProgramCompleted, findModuleByLessonId, findModuleByInstructionId } = require('../helpers/completionHelper');

const XP_HISTORY_MAX = 1000;

const addExperience = async (user, type, payload) => {
    if (!user) throw new Error('USER_NOT_FOUND');

    let gained = 0;
    const coinsBefore = user.coins || 0;

    if (type === 'LESSON_COMPLETED') {
        const { lessonId, programId } = payload;
        const alreadyGiven = user.xpHistory.some(entry => entry.type === 'LESSON_COMPLETED' && entry.meta.lessonId === lessonId);
        if (alreadyGiven) return { gained: 0, streakBonus: 0, totalGain: 0 };

        const info = resolveLessonInfo(programId, lessonId);
        payload.moduleIndex ??= info.moduleIndex;
        payload.durationSec ??= info.durationSec;
        gained = computeLessonXP(payload);

        grantCoins(user, 'LESSON_COMPLETED', coinsCfg.LESSON_COMPLETED, { programId, lessonId });
    }

    if (type === 'CHEST_OPENED') {
        gained = payload.xpReward || 0;
    }

    if (type === 'INSTRUCTION_GRADED') {
        const { programId, instructionId } = payload;
        const userProg = user.programs?.[programId];
        if (!userProg) return { gained: 0, streakBonus: 0, totalGain: 0 };

        const instr = userProg.instructions?.find(i => i.instructionId === instructionId);
        if (!instr || instr.status !== 'GRADED' || instr.xpGrantedAt) return { gained: 0, streakBonus: 0, totalGain: 0 };

        instr.xpGrantedAt = new Date();
        gained = computeInstructionXP(payload);

        const instrCoins = computeInstructionCoins(payload.score);
        grantCoins(user, 'INSTRUCTION_GRADED', instrCoins, { programId, instructionId, score: payload.score });
    }

    const tz = user.dailyStreak?.timezone || 'America/Argentina/Buenos_Aires';
    const today = localTodayString(tz);
    const last = user.dailyStreak?.lastActivityLocalDate;
    let streakBonus = 0;

    if (!last || !isSameLocalDay(last, today)) {
        const newCount = isConsecutiveLocalDay(last, today) ? (user.dailyStreak?.count || 0) + 1 : 1;
        const capped = Math.min(newCount, xpCfg.STREAK.CAP_DAY);
        streakBonus = xpCfg.STREAK.DAILY_BONUS_PER_DAY[capped - 1] || 0;

        if (!user.dailyStreak) user.dailyStreak = {};
        user.dailyStreak.count = newCount;
        user.dailyStreak.lastActivityLocalDate = today;

        if (streakBonus > 0) user.xpHistory.push({ type: 'DAILY_STREAK_BONUS', xp: streakBonus, meta: { day: newCount } });

        grantCoins(user, 'DAILY_STREAK', coinsCfg.DAILY_STREAK, { day: newCount });
        if (newCount === 7) grantCoins(user, 'STREAK_BONUS', coinsCfg.STREAK_BONUS_7, { milestone: 7 });
        if (newCount === 30) grantCoins(user, 'STREAK_BONUS', coinsCfg.STREAK_BONUS_30, { milestone: 30 });
    }

    let totalGain = gained + streakBonus;
    if (totalGain < 0) totalGain = 0;
    user.level.experienceTotal += totalGain;
    while (user.level.experienceTotal >= user.level.experienceNextLevel && user.level.currentLevel < xpCfg.LEVELS.MAX_LEVEL) {
        user.level.currentLevel += 1;
        user.level.experienceCurrentLevel = user.level.experienceNextLevel;
        user.level.experienceNextLevel = nextLevelTarget(user.level.currentLevel, user.level.experienceCurrentLevel, xpCfg);
    }
    user.level.progress = computeLevelProgress(user.level);

    if (gained > 0) {
        user.xpHistory.push({ type, xp: gained, meta: payload });
        const progId = payload.programId;
        if (progId && user.programs?.[progId]) {
            user.programs[progId].totalXp = (user.programs[progId].totalXp || 0) + gained;
        }
    }
    if (user.xpHistory.length > XP_HISTORY_MAX) user.xpHistory = user.xpHistory.slice(-XP_HISTORY_MAX);

    const { newlyUnlocked } = await unlockAchievements(user);

    const progId = payload.programId;
    if (progId && user.programs?.[progId]) {
        const moduleCfg =
            type === 'LESSON_COMPLETED' ? findModuleByLessonId(progId, payload.lessonId)
            : type === 'INSTRUCTION_GRADED' ? findModuleByInstructionId(progId, payload.instructionId)
            : null;

        if (moduleCfg && isModuleCompleted(progId, moduleCfg.id, user.programs[progId])) {
            const rewarded = user.programs[progId].coinsRewardedModules || [];
            if (!rewarded.includes(moduleCfg.id)) {
                grantCoins(user, 'MODULE_COMPLETED', coinsCfg.MODULE_COMPLETED, { programId: progId, moduleId: moduleCfg.id });
                user.programs[progId].coinsRewardedModules = [...rewarded, moduleCfg.id];
            }
        }

        if (isProgramCompleted(progId, user.programs[progId])) {
            if (!user.programs[progId].coinsRewardedProgram) {
                grantCoins(user, 'PROGRAM_COMPLETED', coinsCfg.PROGRAM_COMPLETED, { programId: progId });
                user.programs[progId].coinsRewardedProgram = true;
            }
        }
    }

    trimCoinsHistory(user);

    const coinsGained = (user.coins || 0) - coinsBefore;
    return { gained, streakBonus, totalGain, achievementsUnlocked: newlyUnlocked, coinsTotal: user.coins, coinsGained };
};

module.exports = { addExperience };
