module.exports = {
    LEVELS: {
        base: 1000,
        growth: 1.2
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
            BONUS_FAST: 0.30,
            THRESHOLD_OK: 1.0,
            BONUS_OK: 0.10,
        },
        SCORE_BONUS_FACTOR: 0.50,
        MIN_XP: 50,
        MAX_XP: 3000
    },
    STREAK: {
        DAILY_BONUS_PER_DAY: [25, 50, 100, 200, 400, 800, 1500],
        CAP_DAY: 7,
    }
};
