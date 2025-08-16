const xpCfg = require('../config/xpConfig');

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const nextLevelTarget = (prevNext, cfg) => {
    const { base, growth } = cfg.LEVELS;
    return prevNext ? Math.ceil(prevNext * growth) : base;
};

const localTodayString = (tz = 'UTC', d = new Date()) => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(d);
};

const isSameLocalDay = (a, b) => a === b;

const isConsecutiveLocalDay = (a, b) => {
    if (!a || !b) return false;
    const nextA = new Date(a + 'T00:00:00Z');
    nextA.setUTCDate(nextA.getUTCDate() + 1);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year:'numeric', month:'2-digit', day:'2-digit' });
    return fmt.format(nextA) === b;
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

module.exports = {
    nextLevelTarget,
    localTodayString,
    isSameLocalDay,
    isConsecutiveLocalDay,
    computeLessonXP,
    computeInstructionXP,
    computeLevelProgress
};