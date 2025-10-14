const { validationResult } = require('express-validator');
const Prompt = require('../models/promptModel');
const User = require('../models/userModel');
const { getError } = require('../helpers/getError');

const getAllPrompts = async (req, res) => {
    try {
        const { search, category, difficulty, tags, platforms, sortBy = 'popular', favoritesOnly, stannumVerifiedOnly, page = 1, limit = 20 } = req.query;
        const filters = { 
            status: true,
            visibility: 'published'
        };
        
        if (favoritesOnly === 'true') {
            const user = await User.findById(req.userAuth.id).select('favorites.prompts');
            const favoriteIds = user?.favorites?.prompts || [];
            if (favoriteIds.length === 0) {
                return res.json({
                    success: true,
                    data: {
                        prompts: [],
                        pagination: {
                            currentPage: parseInt(page),
                            totalPages: 0,
                            totalPrompts: 0,
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
        if (tags) {
            const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
            filters.tags = { $in: tagArray };
        }
        if (platforms) {
            const platformArray = platforms.split(',').map(p => p.trim().toLowerCase());
            filters.platforms = { $in: platformArray };
        }
        let sortConfig = {};
        switch (sortBy) {
            case 'newest':
                sortConfig = { createdAt: -1 };
                break;
            case 'mostCopied':
                sortConfig = { 'metrics.copiesCount': -1 };
                break;
            case 'mostLiked':
                sortConfig = { 'metrics.likesCount': -1 };
                break;
            case 'mostViewed':
                sortConfig = { 'metrics.viewsCount': -1 };
                break;
            case 'verified':
                sortConfig = { 'stannumVerified.isVerified': -1, 'metrics.copiesCount': -1 };
                break;
            case 'popular':
            default:
                sortConfig = { 
                    'stannumVerified.isVerified': -1,
                    'metrics.copiesCount': -1, 
                    'metrics.likesCount': -1,
                    'metrics.favoritesCount': -1
                };
        }
        if (search && search.trim().length >= 2) {
            const searchRegex = new RegExp(search.trim(), 'i');
            filters.$or = [
                { title: searchRegex },
                { description: searchRegex },
                { tags: { $in: [searchRegex] } }
            ];
        }
        const query = Prompt.find(filters).populate('author', 'username profile.name').sort(sortConfig);
        const skip = (page - 1) * limit;
        const prompts = await query.skip(skip).limit(parseInt(limit));
        const totalPrompts = await Prompt.countDocuments(filters);
        const totalPages = Math.ceil(totalPrompts / limit);
        const promptsWithUserActions = prompts.map(prompt => prompt.getPreview(req.userAuth.id));
        return res.json({
            success: true,
            data: {
                prompts: promptsWithUserActions,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalPrompts,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting prompts:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getPromptById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_PROMPT_ID_REQUIRED"));

        const prompt = await Prompt.findOne({
            _id: id,
            status: true,
            visibility: 'published'
        }).populate('author', 'username profile.name');
        
        if (!prompt) return res.status(404).json(getError("PROMPT_NOT_FOUND"));

        await prompt.incrementViews();
        const promptDetails = prompt.getFullDetails(req.userAuth.id);

        return res.json({ success: true, data: promptDetails });
    } catch (error) {
        console.error('Error getting prompt:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const createPrompt = async (req, res) => {
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

        const { title, description, content, category, difficulty, platforms, customGptUrl, tags, exampleOutput, visibility } = req.body;
        const processedTags = tags ? tags.map(tag => tag.toLowerCase().trim()) : [];
        
        const searchKeywords = [
            ...title.toLowerCase().split(' '),
            ...description.toLowerCase().split(' '),
            ...processedTags
        ].filter(keyword => keyword.length > 2);

        const newPrompt = new Prompt({
            title,
            description,
            content,
            category,
            difficulty,
            platforms: platforms || [],
            customGptUrl,
            tags: processedTags,
            exampleOutput,
            author: req.userAuth.id,
            searchKeywords: [...new Set(searchKeywords)],
            status: true,
            visibility: visibility || 'published'
        });

        await newPrompt.save();
        await newPrompt.populate('author', 'username profile.name');

        return res.status(201).json({
            success: true,
            data: newPrompt.getFullDetails(req.userAuth.id),
            message: 'Prompt created successfully'
        });
    } catch (error) {
        console.error('Error creating prompt:', error);
        return res.status(500).json(getError("PROMPT_CREATION_FAILED"));
    }
};

const updatePrompt = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_PROMPT_ID_REQUIRED"));
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const formattedErrors = errors.array().map(err => ({
                field: err.path,
                message: err.msg,
            }));
            const baseError = getError("VALIDATION_GENERIC_ERROR");
            return res.status(400).json({ ...baseError, errors: formattedErrors });
        }
        const prompt = await Prompt.findById(id);
        if (!prompt) return res.status(404).json(getError("PROMPT_NOT_FOUND"));
        if (prompt.author.toString() !== req.userAuth.id.toString()) return res.status(403).json(getError("PROMPT_UNAUTHORIZED_UPDATE"));
        if (prompt.visibility !== 'draft') return res.status(403).json(getError("PROMPT_CANNOT_EDIT_PUBLISHED"));
        const { title, description, content, category, difficulty, platforms, customGptUrl, tags, exampleOutput } = req.body;
        const processedTags = tags ? tags.map(tag => tag.toLowerCase().trim()) : [];
        const searchKeywords = [
            ...title.toLowerCase().split(' '),
            ...description.toLowerCase().split(' '),
            ...processedTags
        ].filter(keyword => keyword.length > 2);

        prompt.title = title;
        prompt.description = description;
        prompt.content = content;
        prompt.category = category;
        prompt.difficulty = difficulty;
        prompt.platforms = platforms || [];
        prompt.customGptUrl = customGptUrl;
        prompt.tags = processedTags;
        prompt.exampleOutput = exampleOutput;
        prompt.searchKeywords = [...new Set(searchKeywords)];
        await prompt.save();
        await prompt.populate('author', 'username profile.name');

        return res.json({
            success: true,
            data: prompt.getFullDetails(req.userAuth.id),
            message: 'Prompt updated successfully'
        });
    } catch (error) {
        console.error('Error updating prompt:', error);
        return res.status(500).json(getError("PROMPT_UPDATE_FAILED"));
    }
};

const deletePrompt = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_PROMPT_ID_REQUIRED"));

        const prompt = await Prompt.findById(id);
        if (!prompt) return res.status(404).json(getError("PROMPT_NOT_FOUND"));
        if (prompt.author.toString() !== req.userAuth.id.toString()) return res.status(403).json(getError("PROMPT_UNAUTHORIZED_DELETE"));
        
        await prompt.softDelete();
        return res.json({ success: true, message: 'Prompt deleted successfully' });
    } catch (error) {
        console.error('Error deleting prompt:', error);
        return res.status(500).json(getError("PROMPT_DELETE_FAILED"));
    }
};

const toggleVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_PROMPT_ID_REQUIRED"));
        const { visibility } = req.body;
        if (!['published', 'hidden', 'draft'].includes(visibility)) return res.status(400).json(getError("VALIDATION_INVALID_VISIBILITY"));

        const prompt = await Prompt.findById(id);
        if (!prompt) return res.status(404).json(getError("PROMPT_NOT_FOUND"));
        if (prompt.author.toString() !== req.userAuth.id.toString()) return res.status(403).json(getError("PROMPT_UNAUTHORIZED_UPDATE"));

        prompt.visibility = visibility;
        await prompt.save();

        return res.json({
            success: true,
            data: { visibility: prompt.visibility },
            message: `Prompt visibility changed to ${visibility}`
        });
    } catch (error) {
        console.error('Error toggling visibility:', error);
        return res.status(500).json(getError("PROMPT_UPDATE_FAILED"));
    }
};

const copyPrompt = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_PROMPT_ID_REQUIRED"));

        const prompt = await Prompt.findOne({ 
            _id: id, 
            status: true,
            visibility: 'published'
        });
        
        if (!prompt) return res.status(404).json(getError("PROMPT_NOT_FOUND"));
        await prompt.incrementCopies();
        
        return res.json({
            success: true,
            data: {
                content: prompt.content,
                copiesCount: prompt.metrics.copiesCount
            },
            message: 'Prompt copied successfully'
        });
    } catch (error) {
        console.error('Error copying prompt:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const likePrompt = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_PROMPT_ID_REQUIRED"));

        const prompt = await Prompt.findOne({ 
            _id: id,
            status: true,
            visibility: 'published'
        });

        if (!prompt) return res.status(404).json(getError("PROMPT_NOT_FOUND"));
        if (prompt.hasUserLiked(req.userAuth.id)) return res.status(400).json(getError("PROMPT_ALREADY_LIKED"));
        await prompt.addLike(req.userAuth.id);

        return res.json({
            success: true,
            data: { likesCount: prompt.metrics.likesCount },
            message: 'Prompt liked successfully'
        });
    } catch (error) {
        console.error('Error liking prompt:', error);
        return res.status(500).json(getError("PROMPT_LIKE_FAILED"));
    }
};

const unlikePrompt = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json(getError("VALIDATION_PROMPT_ID_REQUIRED"));

        const prompt = await Prompt.findOne({ 
            _id: id, 
            status: true,
            visibility: 'published'
        });

        if (!prompt) return res.status(404).json(getError("PROMPT_NOT_FOUND"));
        if (!prompt.hasUserLiked(req.userAuth.id)) return res.status(400).json(getError("PROMPT_NOT_LIKED"));
        await prompt.removeLike(req.userAuth.id);

        return res.json({
            success: true,
            data: { likesCount: prompt.metrics.likesCount },
            message: 'Like removed successfully'
        });
    } catch (error) {
        console.error('Error unliking prompt:', error);
        return res.status(500).json(getError("PROMPT_LIKE_FAILED"));
    }
};

const toggleFavorite = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userAuth.id;

        const prompt = await Prompt.findOne({ 
            _id: id, 
            status: true,
            visibility: 'published'
        });
        
        if (!prompt) return res.status(404).json(getError("PROMPT_NOT_FOUND"));
        
        const isFavorited = prompt.favoritedBy.includes(userId);
        
        if (isFavorited) {
            const [updatedPrompt, _] = await Promise.all([
                Prompt.findByIdAndUpdate(id,
                    { 
                        $pull: { favoritedBy: userId },
                        $inc: { 'metrics.favoritesCount': -1 }
                    },
                    { new: true }
                ),
                User.findByIdAndUpdate(userId,
                    { $pull: { 'favorites.prompts': id } },
                    { new: true }
                )
            ]);

            return res.json({
                success: true,
                data: {
                    isFavorited: false,
                    favoritesCount: updatedPrompt.metrics.favoritesCount
                },
                message: 'Removed from favorites'
            });
        } else {
            const [updatedPrompt, _] = await Promise.all([
                Prompt.findByIdAndUpdate(id,
                    { 
                        $addToSet: { favoritedBy: userId },
                        $inc: { 'metrics.favoritesCount': 1 }
                    },
                    { new: true }
                ),
                User.findByIdAndUpdate(userId,
                    { $addToSet: { 'favorites.prompts': id } },
                    { new: true }
                )
            ]);

            return res.json({
                success: true,
                data: {
                    isFavorited: true,
                    favoritesCount: updatedPrompt.metrics.favoritesCount
                },
                message: 'Added to favorites'
            });
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        return res.status(500).json(getError("PROMPT_FAVORITE_FAILED"));
    }
};

const getUserPrompts = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        
        const prompts = await Prompt.find({
            author: userId,
            status: true,
            visibility: 'published'
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('author', 'username profile.name');

        const totalPrompts = await Prompt.countDocuments({
            author: userId,
            status: true,
            visibility: 'published'
        });

        const promptsData = prompts.map(prompt => prompt.getPreview(req.userAuth.id));

        return res.json({
            success: true,
            data: {
                prompts: promptsData,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalPrompts / limit),
                    totalPrompts
                }
            }
        });
    } catch (error) {
        console.error('Error getting user prompts:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getMyPrompts = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        
        const prompts = await Prompt.find({
            author: req.userAuth.id,
            status: true
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('author', 'username profile.name');

        const totalPrompts = await Prompt.countDocuments({
            author: req.userAuth.id,
            status: true
        });

        const promptsData = prompts.map(prompt => prompt.getFullDetails(req.userAuth.id));
        
        return res.json({
            success: true,
            data: {
                prompts: promptsData,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalPrompts / limit),
                    totalPrompts
                }
            }
        });
    } catch (error) {
        console.error('Error getting my prompts:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getMyFavorites = async (req, res) => {
    try {
        const user = await User.findById(req.userAuth.id);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const favoritePrompts = await user.getFavoritePrompts();
        const promptsData = favoritePrompts.map(prompt => prompt.getPreview(req.userAuth.id));

        return res.json({
            success: true,
            data: {
                prompts: promptsData,
                totalFavorites: promptsData.length
            }
        });
    } catch (error) {
        console.error('Error getting favorites:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getStats = async (_, res) => {
    try {
        const stats = await Prompt.aggregate([
            { $match: { status: true, visibility: 'published' } },
            {
                $group: {
                    _id: null,
                    totalPrompts: { $sum: 1 },
                    totalCopies: { $sum: '$metrics.copiesCount' },
                    totalLikes: { $sum: '$metrics.likesCount' },
                    totalViews: { $sum: '$metrics.viewsCount' }
                }
            }
        ]);

        const categoryStats = await Prompt.aggregate([
            { $match: { status: true, visibility: 'published' } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalCopies: { $sum: '$metrics.copiesCount' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const totalAuthors = await Prompt.distinct('author', { 
            status: true,
            visibility: 'published'
        });

        return res.json({
            success: true,
            data: {
                overview: stats[0] || {
                    totalPrompts: 0,
                    totalCopies: 0,
                    totalLikes: 0,
                    totalViews: 0
                },
                byCategory: categoryStats,
                totalAuthors: totalAuthors.length
            }
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getTopPrompts = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const topPrompts = await Prompt.getTopPrompts(parseInt(limit));
        const promptsData = topPrompts.map(prompt => prompt.getPreview(req.userAuth.id));

        return res.json({
            success: true,
            data: { prompts: promptsData }
        });
    } catch (error) {
        console.error('Error getting top prompts:', error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { getAllPrompts, getPromptById, createPrompt, updatePrompt, deletePrompt, toggleVisibility, copyPrompt, likePrompt, unlikePrompt, toggleFavorite, getUserPrompts, getMyPrompts, getMyFavorites, getStats, getTopPrompts };