const User = require('../models/userModel');
const { clamp, nextLevelTarget, localTodayString, isSameLocalDay, isConsecutiveLocalDay } = require('../helpers/experienceHelper');
const { resolveLessonInfo } = require('../helpers/resolveLessonInfo');
const xpCfg = require('../config/xpConfig');

const XP_HISTORY_MAX = 1000;

const addExperience = async (userId, type, payload) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    if (type === 'LESSON_COMPLETED') {
        const { lessonId } = payload || {};
        const alreadyGiven = user.xpHistory.some(entry => entry.type === 'LESSON_COMPLETED' && entry.meta.lessonId === lessonId);
        if (alreadyGiven) return { gained: 0, streakBonus: 0, totalGain: 0, level: user.level, streak: user.dailyStreak };
    }

    if (type === 'INSTRUCTION_GRADED') {
        const { programId, instructionId } = payload || {};
        const userProg = user.programs?.[programId];
        if (!userProg) return { gained: 0, streakBonus: 0, totalGain: 0, level: user.level, streak: user.dailyStreak };
        
        const instr = userProg.instructions?.find(i => i.instructionId === instructionId);
        if (!instr || instr.status !== 'GRADED' || instr.xpGrantedAt) return { gained: 0, streakBonus: 0, totalGain: 0, level: user.level, streak: user.dailyStreak };
        instr.xpGrantedAt = new Date();
    }

    if (type === 'LESSON_COMPLETED') {
        const needsModule = payload.moduleIndex === undefined || payload.moduleIndex === null;
        const needsDuration = !payload.durationSec || payload.durationSec <= 0;

        if (needsModule || needsDuration) {
            const info = resolveLessonInfo(payload.programId, payload.lessonId);
            if (needsModule) payload.moduleIndex = info.moduleIndex;
            if (needsDuration) payload.durationSec = info.durationSec;
        }
    }

    let gained = 0;
    if (type === 'LESSON_COMPLETED') gained = computeLessonXP(payload);
    else if (type === 'INSTRUCTION_GRADED') gained = computeInstructionXP(payload);
    else throw new Error('INVALID_XP_TYPE');

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

    const totalGain = gained + streakBonus;
    user.level.experienceTotal += totalGain;

    while (user.level.experienceTotal >= user.level.experienceNextLevel) {
        user.level.currentLevel += 1;
        user.level.experienceCurrentLevel = user.level.experienceNextLevel;
        user.level.experienceNextLevel = nextLevelTarget(user.level.experienceNextLevel, xpCfg);
    }
    user.level.progress = computeLevelProgress(user.level);

    user.xpHistory.push({ type, xp: gained, meta: payload });
    if (user.xpHistory.length > XP_HISTORY_MAX) user.xpHistory = user.xpHistory.slice(-XP_HISTORY_MAX);

    await user.save();
    return { gained, streakBonus, totalGain, level: user.level, streak: user.dailyStreak };
};


const computeLessonXP = ({ moduleIndex = 0, durationSec = 0 }) => {
    const baseArr = xpCfg.LESSON.BASE_BY_MODULE_INDEX;
    const base = baseArr[moduleIndex] ?? baseArr[baseArr.length - 1];
    const factor = 1 + (durationSec / 600) * xpCfg.LESSON.DURATION_FACTOR_PER_10MIN;
    return clamp(Math.round(base * factor), xpCfg.LESSON.MIN_XP, xpCfg.LESSON.MAX_XP);
};

const computeInstructionXP = ({ rewardXP = 0, score = 0, timeTakenSec = 0, estimatedTimeSec = 0 }) => {
    let xp = rewardXP;
    if (estimatedTimeSec > 0 && timeTakenSec > 0) {
        const ratio = timeTakenSec / estimatedTimeSec;
        if (ratio <= xpCfg.INSTRUCTION.SPEED_BONUS.THRESHOLD_FAST) {
            xp += Math.round(rewardXP * xpCfg.INSTRUCTION.SPEED_BONUS.BONUS_FAST);
        } else if (ratio <= xpCfg.INSTRUCTION.SPEED_BONUS.THRESHOLD_OK) {
            xp += Math.round(rewardXP * xpCfg.INSTRUCTION.SPEED_BONUS.BONUS_OK);
        }
    }
    const scoreFactor = clamp(score, 0, 100) / 100;
    xp += Math.round(rewardXP * xpCfg.INSTRUCTION.SCORE_BONUS_FACTOR * scoreFactor);
    return clamp(xp, xpCfg.INSTRUCTION.MIN_XP, xpCfg.INSTRUCTION.MAX_XP);
};

const computeLevelProgress = (level) => {
    const { experienceTotal, experienceCurrentLevel, experienceNextLevel } = level;
    if (experienceTotal <= experienceCurrentLevel) return 0;
    if (experienceTotal >= experienceNextLevel) return 100;
    const span = experienceNextLevel - experienceCurrentLevel;
    return Math.round(((experienceTotal - experienceCurrentLevel) / span) * 100);
};

module.exports = { addExperience, computeLessonXP, computeInstructionXP };