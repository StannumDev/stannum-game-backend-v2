const User = require('../models/userModel');
const {
    localTodayString,
    isSameLocalDay,
    isConsecutiveLocalDay,
    daysBetweenLocalDates,
    computeActualLostAt,
} = require('../helpers/experienceHelper');
const { hasAnyAccess } = require('../utils/accessControl');
const { invalidateUser } = require('../cache/cacheService');

/**
 * Eagerly consumes a streak shield if the user has a gap since their
 * last activity (or last shield-covered date).
 * Uses atomic findOneAndUpdate with shields >= 1 to prevent double-consumption.
 *
 * @returns {{ shieldConsumed: boolean, streakSaved: boolean }}
 */
const applyShieldIfNeeded = async (userId) => {
    const user = await User.findById(userId).select('dailyStreak programs');
    if (!user?.dailyStreak) return { shieldConsumed: false, streakSaved: false };

    // Streak freeze: if user has no access to any program, skip evaluation entirely
    if (!hasAnyAccess(user.programs)) return { shieldConsumed: false, streakSaved: false };

    const { shields = 0, lastActivityLocalDate: last, shieldCoveredDate } = user.dailyStreak;
    const tz = user.dailyStreak.timezone || 'America/Argentina/Buenos_Aires';
    const today = localTodayString(tz);

    if (shields < 1) return { shieldConsumed: false, streakSaved: false };
    if (!last) return { shieldConsumed: false, streakSaved: false };

    const effectiveLast = (shieldCoveredDate && shieldCoveredDate > last) ? shieldCoveredDate : last;

    if (isSameLocalDay(effectiveLast, today)) return { shieldConsumed: false, streakSaved: false };
    if (isConsecutiveLocalDay(effectiveLast, today)) return { shieldConsumed: false, streakSaved: false };

    const daysMissed = daysBetweenLocalDates(effectiveLast, today) - 1;

    if (daysMissed === 1) {
        const missedDay = new Date(effectiveLast + 'T00:00:00Z');
        missedDay.setUTCDate(missedDay.getUTCDate() + 1);
        const coveredDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(missedDay);

        const result = await User.findOneAndUpdate(
            {
                _id: userId,
                'dailyStreak.shields': { $gte: 1 },
            },
            {
                $set: {
                    'dailyStreak.shields': 0,
                    'dailyStreak.shieldCoveredDate': coveredDateStr,
                },
            },
            { new: true }
        );

        if (!result) return { shieldConsumed: false, streakSaved: false };
        invalidateUser(userId);
        return { shieldConsumed: true, streakSaved: true };
    }

    if (daysMissed >= 2) {
        const previousCount = user.dailyStreak.count || 0;
        const update = {
            $set: { 'dailyStreak.shields': 0 },
        };

        if (previousCount > 0) {
            update.$set['dailyStreak.lostCount'] = previousCount;
            update.$set['dailyStreak.lostAt'] = computeActualLostAt(effectiveLast, tz);
        }

        const result = await User.findOneAndUpdate(
            {
                _id: userId,
                'dailyStreak.shields': { $gte: 1 },
            },
            update,
            { new: true }
        );

        if (!result) return { shieldConsumed: false, streakSaved: false };
        invalidateUser(userId);
        return { shieldConsumed: true, streakSaved: false };
    }

    return { shieldConsumed: false, streakSaved: false };
};

module.exports = { applyShieldIfNeeded };
