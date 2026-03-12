const User = require('../models/userModel');
const { chestsMap } = require('../config/chestsConfig');
const { coversMap } = require('../config/coversConfig');
const { addExperience } = require('../services/experienceService');
const { grantCoins, trimCoinsHistory } = require('../services/coinsService');
const { getError } = require('../helpers/getError');
const { hasAccess } = require('../utils/accessControl');
const { invalidateUser, invalidateRankingsForProgram } = require('../cache/cacheService');

const openChest = async (req, res) => {
    try {
        const { programId, chestId } = req.params;
        const userId = req.userAuth.id;

        const chest = chestsMap[chestId];
        if (!chest) return res.status(404).json(getError('CHEST_NOT_FOUND'));
        if (chest.programId !== programId) return res.status(404).json(getError('CHEST_NOT_FOUND'));

        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError('AUTH_USER_NOT_FOUND'));

        const userProgram = user.programs[programId];
        if (!userProgram) return res.status(404).json(getError('VALIDATION_PROGRAM_NOT_FOUND'));
        if (!hasAccess(userProgram)) return res.status(403).json(getError('PROGRAM_NOT_PURCHASED'));

        // Validate prerequisite: afterItemId must be completed
        const afterItemId = chest.afterItemId;
        const isLessonCompleted = userProgram.lessonsCompleted?.some(l => l.lessonId === afterItemId);
        const isInstructionCompleted = userProgram.instructions?.some(
            i => i.instructionId === afterItemId && ['SUBMITTED', 'GRADED'].includes(i.status)
        );
        if (!isLessonCompleted && !isInstructionCompleted) {
            return res.status(400).json(getError('CHEST_PREREQUISITE_NOT_MET'));
        }

        // Atomic double-open prevention
        const atomicResult = await User.findOneAndUpdate(
            {
                _id: userId,
                [`programs.${programId}.chestsOpened.chestId`]: { $ne: chestId },
            },
            {
                $push: {
                    [`programs.${programId}.chestsOpened`]: { chestId, openedAt: new Date() },
                },
            },
            { new: true }
        );
        if (!atomicResult) return res.status(409).json(getError('CHEST_ALREADY_OPENED'));

        // Grant rewards
        const { rewards } = chest;

        // XP
        const xpResult = await addExperience(atomicResult, 'CHEST_OPENED', {
            programId,
            chestId,
            xpReward: rewards.xp,
        });

        // Coins
        if (rewards.coins > 0) {
            grantCoins(atomicResult, 'CHEST_OPENED', rewards.coins, { programId, chestId });
        }

        // Cover reward
        let coverReward = null;
        if (rewards.coverId) {
            const cover = coversMap[rewards.coverId];
            if (cover) {
                const alreadyOwns = atomicResult.unlockedCovers.some(c => c.coverId === rewards.coverId);
                if (!alreadyOwns) {
                    atomicResult.unlockedCovers.push({ coverId: rewards.coverId, unlockedDate: new Date() });
                }
                coverReward = {
                    coverId: cover.id,
                    coverName: cover.name,
                    coverRarity: cover.rarity,
                    coverImageKey: cover.imageKey,
                    alreadyOwned: alreadyOwns,
                };
            }
        }

        trimCoinsHistory(atomicResult);
        await atomicResult.save();
        invalidateUser(userId);
        invalidateRankingsForProgram(programId);

        return res.status(200).json({
            success: true,
            message: 'Cofre abierto.',
            rewards: {
                xp: rewards.xp,
                coins: rewards.coins,
                cover: coverReward,
            },
            xpResult: {
                gained: xpResult.gained,
                totalGain: xpResult.totalGain,
                streakBonus: xpResult.streakBonus,
            },
        });
    } catch (error) {
        console.error('Error al abrir cofre:', error);
        return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
    }
};

module.exports = { openChest };
