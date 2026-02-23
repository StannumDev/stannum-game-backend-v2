const coinsCfg = require('../config/coinsConfig');

const COINS_HISTORY_MAX = 1000;

const grantCoins = (user, type, amount, meta = {}) => {
    if (!user || amount <= 0) return { coinsGranted: 0 };

    user.coins = (user.coins || 0) + amount;
    user.coinsHistory.push({ type, coins: amount, date: new Date(), meta });

    return { coinsGranted: amount };
};

const grantCoinsAtomic = async (userId, type, amount, meta = {}) => {
    if (!userId || amount <= 0) return { coinsGranted: 0 };

    const User = require('../models/userModel');
    const result = await User.findByIdAndUpdate(userId, {
        $inc: { coins: amount },
        $push: {
            coinsHistory: {
                $each: [{ type, coins: amount, date: new Date(), meta }],
                $slice: -COINS_HISTORY_MAX,
            },
        },
    });

    if (!result) return { coinsGranted: 0 };
    return { coinsGranted: amount };
};

const trimCoinsHistory = (user) => {
    if (user.coinsHistory && user.coinsHistory.length > COINS_HISTORY_MAX) {
        user.coinsHistory = user.coinsHistory.slice(-COINS_HISTORY_MAX);
    }
};

const computeInstructionCoins = (score) => {
    if (score === 100) return coinsCfg.INSTRUCTION_GRADED.PERFECT;
    if (score >= 90) return coinsCfg.INSTRUCTION_GRADED.FROM_90;
    if (score >= 70) return coinsCfg.INSTRUCTION_GRADED.FROM_70;
    return coinsCfg.INSTRUCTION_GRADED.BELOW_70;
};

module.exports = { grantCoins, grantCoinsAtomic, trimCoinsHistory, computeInstructionCoins };
