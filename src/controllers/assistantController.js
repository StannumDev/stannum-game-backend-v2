const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Assistant = require('../models/assistantModel');
const User = require('../models/userModel');
const { getError } = require('../helpers/getError');
const { cache, KEYS, TTL, invalidateUser } = require('../cache/cacheService');

const getAllAssistants = async (req, res) => {
    try {
        const { search, category, difficulty, tags, platform, sortBy = 'popular', favoritesOnly, stannumVerifiedOnly, page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
        const filters = {
            status: true,
            visibility: 'published'
        };
        
        if (favoritesOnly === 'true') {
            const user = await User.findById(req.userAuth.id).select('favorites.assistants');
            const favoriteIds = user?.favorites?.assistants || [];
            
            if (favoriteIds.length === 0) {
                return res.json({
                    success: true,
                    data: {
                        assistants: [],
                        pagination: {
                            currentPage: pageNum,
                            totalPages: 0,
                            totalAssistants: 0,
                            hasNextPage: false,
                            hasPrevPage: false
                        }
                    }
                });
            }
            
            filters._id = { $in: favoriteIds };
        }
        
        if (stannumVerifiedOnly === 'true') filters['stannumVerified.isVerified'] = true;
        if (category) filters.category = category;
        if (difficulty) filters.difficulty = difficulty;
        if (platform) filters.platform = platform;
        if (tags) {
            const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
            filters.tags = { $in: tagArray };
        }

        let sortConfig = {};
        switch (sortBy) {
            case 'newest':
                sortConfig = { createdAt: -1 };
                break;
            case 'mostUsed':
                sortConfig = { 'metrics.clicksCount': -1 };
                break;
            case 'mostLiked':
                sortConfig = { 'metrics.likesCount': -1 };
                break;
            case 'mostViewed':
                sortConfig = { 'metrics.viewsCount': -1 };
                break;
            case 'verified':
                sortConfig = { 'stannumVerified.isVerified': -1, 'metrics.clicksCount': -1 };
                break;
            case 'popular':
            default:
                sortConfig = { 
                    'stannumVerified.isVerified': -1,
                    'metrics.clicksCount': -1, 
                    'metrics.likesCount': -1,
                    'metrics.favoritesCount': -1
                };
        }

        if (search && search.trim().length >= 2) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, 'i');
            filters.$or = [
                { title: searchRegex },
                { description: searchRegex },
                { tags: { $in: [searchRegex] } }
            ];
        }
        const query = Assistant.find(filters).populate('author', 'username profile.name preferences.hasProfilePhoto').sort(sortConfig);

        const skip = (pageNum - 1) * limitNum;
        const assistants = await query.skip(skip).limit(limitNum);

        const totalAssistants = await Assistant.countDocuments(filters);
        const totalPages = Math.ceil(totalAssistants / limitNum);

        const assistantsWithUserActions = assistants.map(assistant => assistant.getPreview(req.userAuth.id));
        return res.json({
            success: true,
            data: {
                assistants: assistantsWithUserActions,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalAssistants,
                    hasNextPage: pageNum < totalPages,
                    hasPrevPage: pageNum > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting assistants:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getAssistantById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_ASSISTANT_ID_REQUIRED"));

        const assistant = await Assistant.findOne({
            _id: id,
            status: true,
            visibility: 'published'
        }).populate('author', 'username profile.name preferences.hasProfilePhoto');
        
        if (!assistant) return res.status(404).json(getError("ASSISTANT_NOT_FOUND"));

        const authorId = assistant.author?._id || assistant.author;
        if(authorId?.toString() !== req.userAuth.id.toString()) await assistant.incrementViews();
        const assistantDetails = assistant.getFullDetails(req.userAuth.id);

        return res.json({ success: true, data: assistantDetails });
    } catch (error) {
        console.error('Error getting assistant:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const createAssistant = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const formattedErrors = errors.array().map(err => ({
                field: err.path,
                message: err.msg,
            }));
            const baseError = getError("VALIDATION_GENERIC_ERROR");
            return res.status(400).json({ ...baseError, errors: formattedErrors });
        }

        const { title, description, assistantUrl, category, difficulty, platform, tags, useCases, visibility } = req.body;
        const processedTags = tags ? tags.map(tag => tag.toLowerCase().trim()) : [];
        
        const searchKeywords = [
            ...title.toLowerCase().split(' '),
            ...description.toLowerCase().split(' '),
            ...processedTags
        ].filter(keyword => keyword.length > 2);

        const newAssistant = new Assistant({
            title,
            description,
            assistantUrl,
            category,
            difficulty,
            platform,
            tags: processedTags,
            useCases,
            author: req.userAuth.id,
            searchKeywords: [...new Set(searchKeywords)],
            status: true,
            visibility: visibility || 'published'
        });

        await newAssistant.save();
        await newAssistant.populate('author', 'username profile.name preferences.hasProfilePhoto');

        return res.status(201).json({
            success: true,
            data: newAssistant.getFullDetails(req.userAuth.id),
            message: 'Assistant created successfully'
        });
    } catch (error) {
        console.error('Error creating assistant:', error);
        return res.status(500).json(getError("ASSISTANT_CREATION_FAILED"));
    }
};

const updateAssistant = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_ASSISTANT_ID_REQUIRED"));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const formattedErrors = errors.array().map(err => ({
                field: err.path,
                message: err.msg,
            }));
            const baseError = getError("VALIDATION_GENERIC_ERROR");
            return res.status(400).json({ ...baseError, errors: formattedErrors });
        }

        const assistant = await Assistant.findById(id);
        if (!assistant) return res.status(404).json(getError("ASSISTANT_NOT_FOUND"));

        if (assistant.author.toString() !== req.userAuth.id.toString()) return res.status(403).json(getError("ASSISTANT_UNAUTHORIZED_UPDATE"));

        if (assistant.visibility !== 'draft') {
            return res.status(400).json({
                success: false,
                error: {
                    code: "ASSISTANT_NOT_DRAFT",
                    message: "Solo los borradores pueden ser editados"
                }
            });
        }

        const { title, description, assistantUrl, category, difficulty, platform, tags, useCases, visibility } = req.body;
        const processedTags = tags ? tags.map(tag => tag.toLowerCase().trim()) : [];

        const searchKeywords = [
            ...title.toLowerCase().split(' '),
            ...description.toLowerCase().split(' '),
            ...processedTags
        ].filter(keyword => keyword.length > 2);

        assistant.title = title;
        assistant.description = description;
        assistant.assistantUrl = assistantUrl;
        assistant.category = category;
        assistant.difficulty = difficulty;
        assistant.platform = platform;
        assistant.tags = processedTags;
        assistant.useCases = useCases || '';
        assistant.searchKeywords = [...new Set(searchKeywords)];
        assistant.visibility = visibility || 'draft';

        await assistant.save();
        await assistant.populate('author', 'username profile.name preferences.hasProfilePhoto');

        return res.json({
            success: true,
            data: assistant.getFullDetails(req.userAuth.id),
            message: visibility === 'published' ? 'Asistente publicado exitosamente' : 'Borrador actualizado exitosamente'
        });
    } catch (error) {
        console.error('Error updating assistant:', error);
        return res.status(500).json(getError("ASSISTANT_UPDATE_FAILED"));
    }
};

const deleteAssistant = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_ASSISTANT_ID_REQUIRED"));

        const assistant = await Assistant.findById(id);
        if (!assistant) return res.status(404).json(getError("ASSISTANT_NOT_FOUND"));
        if (assistant.author.toString() !== req.userAuth.id.toString()) return res.status(403).json(getError("ASSISTANT_UNAUTHORIZED_DELETE"));
        await assistant.softDelete();
        return res.json({ success: true, message: 'Assistant deleted successfully' });
    } catch (error) {
        console.error('Error deleting assistant:', error);
        return res.status(500).json(getError("ASSISTANT_DELETE_FAILED"));
    }
};

const toggleVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_ASSISTANT_ID_REQUIRED"));
        
        const { visibility } = req.body;
        if (!['published', 'hidden', 'draft'].includes(visibility)) return res.status(400).json(getError("VALIDATION_INVALID_VISIBILITY"));

        const assistant = await Assistant.findById(id);
        if (!assistant) return res.status(404).json(getError("ASSISTANT_NOT_FOUND"));
        if (assistant.author.toString() !== req.userAuth.id.toString()) return res.status(403).json(getError("ASSISTANT_UNAUTHORIZED_UPDATE"));

        assistant.visibility = visibility;
        await assistant.save();

        // Update communityStats cache and check achievements for the author
        try {
            const { unlockAchievements } = require('../services/achievementsService');
            const author = await User.findById(assistant.author);
            if (author) await unlockAchievements(author, true);
        } catch (err) {
            console.error('[Achievements] Error after assistant visibility change:', err.message);
        }

        return res.json({
            success: true,
            data: { visibility: assistant.visibility },
            message: `Assistant visibility changed to ${visibility}`
        });
    } catch (error) {
        console.error('Error toggling visibility:', error);
        return res.status(500).json(getError("ASSISTANT_UPDATE_FAILED"));
    }
};

const clickAssistant = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_ASSISTANT_ID_REQUIRED"));

        const assistant = await Assistant.findOne({ 
            _id: id, 
            status: true,
            visibility: 'published'
        });
        if (!assistant) return res.status(404).json(getError("ASSISTANT_NOT_FOUND"));

        const isOwnAssistant = assistant.author.toString() === req.userAuth.id.toString();
        if (!isOwnAssistant) await assistant.incrementClicks();

        return res.json({
            success: true,
            data: {
                assistantUrl: assistant.assistantUrl,
                clicksCount: isOwnAssistant ? assistant.metrics.clicksCount : assistant.metrics.clicksCount + 1
            },
            message: 'Click registered successfully'
        });
    } catch (error) {
        console.error('Error clicking assistant:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const likeAssistant = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_ASSISTANT_ID_REQUIRED"));

        const assistant = await Assistant.findOne({ 
            _id: id,
            status: true,
            visibility: 'published'
        });

        if (!assistant) return res.status(404).json(getError("ASSISTANT_NOT_FOUND"));
        if (assistant.hasUserLiked(req.userAuth.id)) return res.status(400).json(getError("ASSISTANT_ALREADY_LIKED"));
        await assistant.addLike(req.userAuth.id);

        return res.json({
            success: true,
            data: { likesCount: assistant.metrics.likesCount + 1 },
            message: 'Assistant liked successfully'
        });
    } catch (error) {
        console.error('Error liking assistant:', error);
        return res.status(500).json(getError("ASSISTANT_LIKE_FAILED"));
    }
};

const unlikeAssistant = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_ASSISTANT_ID_REQUIRED"));

        const assistant = await Assistant.findOne({ 
            _id: id, 
            status: true,
            visibility: 'published'
        });

        if (!assistant) return res.status(404).json(getError("ASSISTANT_NOT_FOUND"));
        if (!assistant.hasUserLiked(req.userAuth.id)) return res.status(400).json(getError("ASSISTANT_NOT_LIKED"));

        await assistant.removeLike(req.userAuth.id);

        return res.json({
            success: true,
            data: { likesCount: Math.max(0, assistant.metrics.likesCount - 1) },
            message: 'Like removed successfully'
        });
    } catch (error) {
        console.error('Error unliking assistant:', error);
        return res.status(500).json(getError("ASSISTANT_LIKE_FAILED"));
    }
};

const toggleFavorite = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userAuth.id;

        const assistant = await Assistant.findOne({ 
            _id: id, 
            status: true,
            visibility: 'published'
        });
        
        if (!assistant) return res.status(404).json(getError("ASSISTANT_NOT_FOUND"));
        const isFavorited = assistant.favoritedBy.includes(userId);
        const session = await mongoose.startSession();
        let updatedAssistant;
        let resultIsFavorited;
        try {
            await session.withTransaction(async () => {
                if (isFavorited) {
                    [updatedAssistant] = await Promise.all([
                        Assistant.findByIdAndUpdate(id,
                            { $pull: { favoritedBy: userId }, $inc: { 'metrics.favoritesCount': -1 } },
                            { new: true, session }
                        ),
                        User.findByIdAndUpdate(userId,
                            { $pull: { 'favorites.assistants': id } },
                            { new: true, session }
                        )
                    ]);
                    resultIsFavorited = false;
                } else {
                    [updatedAssistant] = await Promise.all([
                        Assistant.findByIdAndUpdate(id,
                            { $addToSet: { favoritedBy: userId }, $inc: { 'metrics.favoritesCount': 1 } },
                            { new: true, session }
                        ),
                        User.findByIdAndUpdate(userId,
                            { $addToSet: { 'favorites.assistants': id } },
                            { new: true, session }
                        )
                    ]);
                    resultIsFavorited = true;
                }
            });
        } finally {
            session.endSession();
        }

        const authorId = assistant.author;

        if (resultIsFavorited) {
            if (authorId && authorId.toString() !== userId) {
                try {
                    const { grantCoinsAtomic } = require('../services/coinsService');
                    const coinsCfg = require('../config/coinsConfig');
                    await grantCoinsAtomic(authorId, 'FAVORITE_RECEIVED', coinsCfg.FAVORITE_RECEIVED, {
                        contentType: 'assistant', contentId: id, fromUserId: userId,
                    });
                } catch (err) {
                    console.error('[Coins] Error granting favorite coins to assistant author:', err.message);
                }
            }
        }

        // Invalidate cache for both toggling user and author
        invalidateUser(userId);
        if (authorId && authorId.toString() !== userId) invalidateUser(authorId);

        // Update communityStats cache and check achievements for both users
        // (author's totalFavoritesReceived changed; toggling user's saved count changed)
        try {
            const { unlockAchievements } = require('../services/achievementsService');
            const promises = [];
            if (authorId && authorId.toString() !== userId) {
                const author = await User.findById(authorId);
                if (author) promises.push(unlockAchievements(author, true));
            }
            const toggler = await User.findById(userId);
            if (toggler) promises.push(unlockAchievements(toggler, true));
            await Promise.all(promises);
        } catch (err) {
            console.error('[Achievements] Error after assistant favorite toggle:', err.message);
        }

        return res.json({
            success: true,
            data: {
                isFavorited: resultIsFavorited,
                favoritesCount: updatedAssistant.metrics.favoritesCount
            },
            message: resultIsFavorited ? 'Added to favorites' : 'Removed from favorites'
        });
    } catch (error) {
        console.error('Error toggling favorite:', error);
        return res.status(500).json(getError("ASSISTANT_FAVORITE_FAILED"));
    }
};

const getUserAssistants = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);

        const assistants = await Assistant.find({
            author: userId,
            status: true,
            visibility: 'published'
        })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('author', 'username profile.name preferences.hasProfilePhoto');

        const totalAssistants = await Assistant.countDocuments({
            author: userId,
            status: true,
            visibility: 'published'
        });
        const totalPages = Math.ceil(totalAssistants / limitNum);

        const assistantsData = assistants.map(assistant => assistant.getPreview(req.userAuth.id));

        return res.json({
            success: true,
            data: {
                assistants: assistantsData,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalAssistants,
                    hasNextPage: pageNum < totalPages,
                    hasPrevPage: pageNum > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting user assistants:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getMyAssistants = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);

        const assistants = await Assistant.find({
            author: req.userAuth.id,
            status: true
        })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('author', 'username profile.name preferences.hasProfilePhoto');

        const totalAssistants = await Assistant.countDocuments({
            author: req.userAuth.id,
            status: true
        });
        const totalPages = Math.ceil(totalAssistants / limitNum);

        const assistantsData = assistants.map(assistant => assistant.getFullDetails(req.userAuth.id));

        return res.json({
            success: true,
            data: {
                assistants: assistantsData,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalAssistants,
                    hasNextPage: pageNum < totalPages,
                    hasPrevPage: pageNum > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting my assistants:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getMyFavorites = async (req, res) => {
    try {
        const user = await User.findById(req.userAuth.id);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const favoriteAssistants = (await user.getFavoriteAssistants()).filter(Boolean);
        const assistantsData = favoriteAssistants.map(assistant => assistant.getPreview(req.userAuth.id));

        return res.json({
            success: true,
            data: {
                assistants: assistantsData,
                totalFavorites: assistantsData.length
            }
        });
    } catch (error) {
        console.error('Error getting favorites:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getStats = async (_, res) => {
    try {
        const cached = cache.get(KEYS.ASSISTANT_STATS);
        if (cached) return res.json(cached);

        const stats = await Assistant.aggregate([
            { $match: { status: true, visibility: 'published' } },
            {
                $group: {
                    _id: null,
                    totalAssistants: { $sum: 1 },
                    totalClicks: { $sum: '$metrics.clicksCount' },
                    totalLikes: { $sum: '$metrics.likesCount' },
                    totalViews: { $sum: '$metrics.viewsCount' }
                }
            }
        ]);

        const categoryStats = await Assistant.aggregate([
            { $match: { status: true, visibility: 'published' } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalClicks: { $sum: '$metrics.clicksCount' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const totalAuthors = await Assistant.distinct('author', { 
            status: true,
            visibility: 'published'
        });

        const response = {
            success: true,
            data: {
                overview: stats[0] || {
                    totalAssistants: 0,
                    totalClicks: 0,
                    totalLikes: 0,
                    totalViews: 0
                },
                byCategory: categoryStats,
                totalAuthors: totalAuthors.length
            }
        };
        cache.set(KEYS.ASSISTANT_STATS, response, TTL.STATS);
        return res.json(response);
    } catch (error) {
        console.error('Error getting stats:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getTopAssistants = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const topAssistants = await Assistant.getTopAssistants(parseInt(limit));
        const assistantsData = topAssistants.map(assistant => assistant.getPreview(req.userAuth.id));

        return res.json({
            success: true,
            data: { assistants: assistantsData }
        });
    } catch (error) {
        console.error('Error getting top assistants:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { 
    getAllAssistants,
    getAssistantById,
    createAssistant,
    updateAssistant,
    deleteAssistant,
    toggleVisibility,
    clickAssistant,
    likeAssistant,
    unlikeAssistant,
    toggleFavorite,
    getUserAssistants,
    getMyAssistants,
    getMyFavorites,
    getStats,
    getTopAssistants
};