const { nextLevelTarget, localTodayString, isSameLocalDay, isConsecutiveLocalDay, computeInstructionXP, computeLessonXP, computeLevelProgress } = require('../helpers/experienceHelper');
const { resolveLessonInfo } = require('../helpers/resolveLessonInfo');
const xpCfg = require('../config/xpConfig');
const { unlockAchievements } = require('./achievementsService');

const XP_HISTORY_MAX = 1000;

const addExperience = async (user, type, payload) => {
    if (!user) throw new Error('USER_NOT_FOUND');

    let gained = 0;

    if (type === 'LESSON_COMPLETED') {
        const { lessonId, programId } = payload;
        const alreadyGiven = user.xpHistory.some(entry => entry.type === 'LESSON_COMPLETED' && entry.meta.lessonId === lessonId);
        if (alreadyGiven) return { gained: 0, streakBonus: 0, totalGain: 0 };

        const info = resolveLessonInfo(programId, lessonId);
        payload.moduleIndex ??= info.moduleIndex;
        payload.durationSec ??= info.durationSec;
        gained = computeLessonXP(payload);
    }

    if (type === 'INSTRUCTION_GRADED') {
        const { programId, instructionId } = payload;
        const userProg = user.programs?.[programId];
        if (!userProg) return { gained: 0, streakBonus: 0, totalGain: 0 };

        const instr = userProg.instructions?.find(i => i.instructionId === instructionId);
        if (!instr || instr.status !== 'GRADED' || instr.xpGrantedAt) return { gained: 0, streakBonus: 0, totalGain: 0 };

        instr.xpGrantedAt = new Date();
        gained = computeInstructionXP(payload);
    }

    const tz = user.dailyStreak?.timezone || 'UTC';
    const today = localTodayString(tz);
    const last = user.dailyStreak?.lastActivityLocalDate;
    let streakBonus = 0;

    if (!last || !isSameLocalDay(last, today)) {
        const newCount = isConsecutiveLocalDay(last, today) ? (user.dailyStreak?.count || 0) + 1 : 1;
        const capped = Math.min(newCount, xpCfg.STREAK.CAP_DAY);
        streakBonus = xpCfg.STREAK.DAILY_BONUS_PER_DAY[capped - 1] || 0;

        user.dailyStreak.count = newCount;
        user.dailyStreak.lastActivityLocalDate = today;

        if (streakBonus > 0) user.xpHistory.push({ type: 'DAILY_STREAK_BONUS', xp: streakBonus, meta: { day: newCount } });
    }

    const initialLevel = user.level.currentLevel;
    let totalGain = gained + streakBonus;
    user.level.experienceTotal += totalGain;
    while (user.level.experienceTotal >= user.level.experienceNextLevel) {
        user.level.currentLevel += 1;
        user.level.experienceCurrentLevel = user.level.experienceNextLevel;
        user.level.experienceNextLevel = nextLevelTarget(user.level.experienceNextLevel, xpCfg);
    }
    user.level.progress = computeLevelProgress(user.level);

    if(initialLevel < user.level.currentLevel || user.dailyStreak.count >= 3) await unlockAchievements(user)
    if (gained > 0) user.xpHistory.push({ type, xp: gained, meta: payload });
    if (user.xpHistory.length > XP_HISTORY_MAX) user.xpHistory = user.xpHistory.slice(-XP_HISTORY_MAX);
    
    const { newlyUnlocked } = await unlockAchievements(user);

    return { gained, streakBonus, totalGain, achievementsUnlocked: newlyUnlocked };
};

module.exports = { addExperience };