const User = require('../models/userModel');
const { covers, coversMap } = require('../config/coversConfig');
const { deductCoinsAtomic } = require('../services/coinsService');
const { getError } = require('../helpers/getError');

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

module.exports = { getCovers, purchaseCover, equipCover };
