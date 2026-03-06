const xpCfg = require('../config/xpConfig');

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const nextLevelTarget = (currentLevel, experienceCurrentLevel, cfg) => {
    const { base, tiers } = cfg.LEVELS;
    let cost = base;
    for (let lvl = 3; lvl <= currentLevel + 1; lvl++) {
        const tier = tiers.find(t => lvl <= t.upToLevel) || tiers[tiers.length - 1];
        cost += tier.increment;
    }
    return experienceCurrentLevel + cost;
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

/**
 * Given the last effective local date (YYYY-MM-DD) and the user's timezone,
 * returns the Date when the streak was actually lost: midnight after the
 * grace day (effectiveLast + 2 days) in the user's timezone.
 */
const computeActualLostAt = (effectiveLastLocalDate, tz = 'America/Argentina/Buenos_Aires') => {
    // effectiveLast + 1 = grace day, effectiveLast + 2 = loss moment (midnight)
    const lossDate = new Date(effectiveLastLocalDate + 'T00:00:00Z');
    lossDate.setUTCDate(lossDate.getUTCDate() + 2);

    // Get the TZ offset at the loss date using Intl (server-TZ-independent)
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(lossDate);
    const get = (type) => parts.find(p => p.type === type)?.value || '0';
    const tzHour = parseInt(get('hour'), 10);
    const tzMinute = parseInt(get('minute'), 10);
    // lossDate is midnight UTC; the TZ shows what time it is there at that moment
    // Offset = TZ_time - UTC_time. Midnight in TZ = midnight UTC - offset
    const offsetMs = ((tzHour >= 12 ? tzHour - 24 : tzHour) * 60 + tzMinute) * 60 * 1000;

    return new Date(lossDate.getTime() - offsetMs);
};

const daysBetweenLocalDates = (a, b) => {
    if (!a || !b) return Infinity;
    const dateA = new Date(a + 'T00:00:00Z');
    const dateB = new Date(b + 'T00:00:00Z');
    return Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
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
    daysBetweenLocalDates,
    computeActualLostAt,
    computeLessonXP,
    computeInstructionXP,
    computeLevelProgress
};