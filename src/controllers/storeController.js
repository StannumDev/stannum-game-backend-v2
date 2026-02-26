const User = require('../models/userModel');
const { covers, coversMap } = require('../config/coversConfig');
const coinsCfg = require('../config/coinsConfig');
const { deductCoinsAtomic } = require('../services/coinsService');
const { getError } = require('../helpers/getError');
const { localTodayString } = require('../helpers/experienceHelper');

const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

const getCovers = async (req, res) => {
    try {
        const userId = req.userAuth.id;
        const user = await User.findById(userId).select('unlockedCovers equippedCoverId');
        if (!user) return res.status(404).json(getError('AUTH_USER_NOT_FOUND'));

        const ownedIds = new Set(user.unlockedCovers.map(c => c.coverId));
        ownedIds.add('default');

        const data = covers.map(cover => ({
            ...cover,
            owned: ownedIds.has(cover.id),
            equipped: user.equippedCoverId === cover.id,
        }));

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Error al obtener covers:', error);
        return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
    }
};

const purchaseCover = async (req, res) => {
    try {
        const userId = req.userAuth.id;
        const { coverId } = req.body;

        const cover = coversMap[coverId];
        if (!cover) return res.status(404).json(getError('STORE_COVER_NOT_FOUND'));

        const user = await User.findById(userId).select('coins unlockedCovers');
        if (!user) return res.status(404).json(getError('AUTH_USER_NOT_FOUND'));

        const alreadyOwned = coverId === 'default' || user.unlockedCovers.some(c => c.coverId === coverId);
        if (alreadyOwned) return res.status(409).json(getError('STORE_COVER_ALREADY_OWNED'));

        if (user.coins < cover.price) return res.status(400).json(getError('STORE_INSUFFICIENT_TINS'));

        const { coinsDeducted } = await deductCoinsAtomic(userId, 'STORE_PURCHASE', cover.price, { coverId });
        if (!coinsDeducted) return res.status(400).json(getError('STORE_INSUFFICIENT_TINS'));

        await User.findByIdAndUpdate(userId, {
            $push: { unlockedCovers: { coverId, unlockedDate: new Date() } },
        });

        return res.status(200).json({ success: true, message: 'Portada desbloqueada.', coverId, coinsSpent: cover.price });
    } catch (error) {
        console.error('Error al comprar cover:', error);
        return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
    }
};

const equipCover = async (req, res) => {
    try {
        const userId = req.userAuth.id;
        const { coverId } = req.body;

        if (coverId !== 'default') {
            const cover = coversMap[coverId];
            if (!cover) return res.status(404).json(getError('STORE_COVER_NOT_FOUND'));

            const user = await User.findById(userId).select('unlockedCovers');
            if (!user) return res.status(404).json(getError('AUTH_USER_NOT_FOUND'));

            const owned = user.unlockedCovers.some(c => c.coverId === coverId);
            if (!owned) return res.status(400).json(getError('STORE_COVER_NOT_OWNED'));
        }

        await User.findByIdAndUpdate(userId, { equippedCoverId: coverId });

        return res.status(200).json({ success: true, message: 'Portada equipada.', coverId });
    } catch (error) {
        console.error('Error al equipar cover:', error);
        return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
    }
};

const purchaseShield = async (req, res) => {
    try {
        const userId = req.userAuth.id;
        const price = coinsCfg.STORE.STREAK_SHIELD;

        const user = await User.findById(userId).select('coins dailyStreak');
        if (!user) return res.status(404).json(getError('AUTH_USER_NOT_FOUND'));

        if ((user.dailyStreak?.shields || 0) >= coinsCfg.STREAK_SHIELD_MAX) {
            return res.status(400).json(getError('STORE_SHIELD_MAX_REACHED'));
        }

        if (user.coins < price) return res.status(400).json(getError('STORE_INSUFFICIENT_TINS'));

        const result = await User.findOneAndUpdate(
            {
                _id: userId,
                coins: { $gte: price },
                'dailyStreak.shields': { $not: { $gte: coinsCfg.STREAK_SHIELD_MAX } },
            },
            {
                $inc: { coins: -price },
                $set: { 'dailyStreak.shields': 1 },
                $push: {
                    coinsHistory: {
                        $each: [{
                            type: 'STREAK_SHIELD_PURCHASE',
                            coins: -price,
                            date: new Date(),
                            meta: { itemId: 'streak_shield' },
                        }],
                        $slice: -1000,
                    },
                },
            },
            { new: true }
        );

        if (!result) return res.status(400).json(getError('STORE_INSUFFICIENT_TINS'));

        return res.status(200).json({
            success: true,
            message: 'Escudo de racha comprado.',
            shields: result.dailyStreak?.shields || 0,
            coinsSpent: price,
            coinsRemaining: result.coins,
        });
    } catch (error) {
        console.error('Error al comprar escudo:', error);
        return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
    }
};

const recoverStreak = async (req, res) => {
    try {
        const userId = req.userAuth.id;
        const price = coinsCfg.STORE.STREAK_RECOVERY;

        const user = await User.findById(userId).select('coins dailyStreak');
        if (!user) return res.status(404).json(getError('AUTH_USER_NOT_FOUND'));

        const { lostCount, lostAt } = user.dailyStreak || {};
        if (!lostCount || !lostAt) {
            return res.status(400).json(getError('STREAK_RECOVERY_NOT_AVAILABLE'));
        }

        const elapsed = Date.now() - new Date(lostAt).getTime();
        if (elapsed > RECOVERY_WINDOW_MS) {
            user.dailyStreak.lostCount = null;
            user.dailyStreak.lostAt = null;
            await user.save();
            return res.status(400).json(getError('STREAK_RECOVERY_EXPIRED'));
        }

        if (user.coins < price) return res.status(400).json(getError('STORE_INSUFFICIENT_TINS'));

        const tz = user.dailyStreak?.timezone || 'America/Argentina/Buenos_Aires';
        const today = localTodayString(tz);

        const result = await User.findOneAndUpdate(
            {
                _id: userId,
                coins: { $gte: price },
                'dailyStreak.lostCount': lostCount,
            },
            {
                $inc: { coins: -price },
                $set: {
                    'dailyStreak.count': lostCount,
                    'dailyStreak.lastActivityLocalDate': today,
                    'dailyStreak.lostCount': null,
                    'dailyStreak.lostAt': null,
                },
                $push: {
                    coinsHistory: {
                        $each: [{
                            type: 'STREAK_RECOVERY',
                            coins: -price,
                            date: new Date(),
                            meta: { recoveredCount: lostCount },
                        }],
                        $slice: -1000,
                    },
                },
            },
            { new: true }
        );

        if (!result) return res.status(400).json(getError('STORE_INSUFFICIENT_TINS'));

        return res.status(200).json({
            success: true,
            message: 'Racha recuperada.',
            restoredCount: lostCount,
            coinsSpent: price,
            coinsRemaining: result.coins,
        });
    } catch (error) {
        console.error('Error al recuperar racha:', error);
        return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
    }
};

module.exports = { getCovers, purchaseCover, equipCover, purchaseShield, recoverStreak };
