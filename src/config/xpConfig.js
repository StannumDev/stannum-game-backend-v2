module.exports = {
    LEVELS: {
        base: 150,
        tiers: [
            { upToLevel: 10, increment: 50 },
            { upToLevel: 20, increment: 100 },
            { upToLevel: 30, increment: 200 },
        ]
    },
    LESSON: {
        BASE_BY_MODULE_INDEX: [100, 140, 180, 230, 280],
        DURATION_FACTOR_PER_10MIN: 1.0,
        MIN_XP: 50,
        MAX_XP: 1500
    },
    INSTRUCTION: {
        SPEED_BONUS: {
            THRESHOLD_FAST: 0.7,
            BONUS_FAST: 0.3,
            THRESHOLD_OK: 1.0,
            BONUS_OK: 0.1,
        },
        SCORE_BONUS_FACTOR: 0.5,
        MIN_XP: 50,
        MAX_XP: 3000
    },
    STREAK: {
        DAILY_BONUS_PER_DAY: [25, 38, 57, 86, 129, 194, 291],
        CAP_DAY: 7,
    }
};