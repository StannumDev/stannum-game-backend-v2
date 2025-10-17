const { Schema, model } = require("mongoose");

const metricsSchema = new Schema({
    clicksCount: {
        type: Number,
        default: 0,
        min: [0, "Clicks count cannot be negative"],
        validate: {
            validator: Number.isInteger,
            message: "Clicks count must be an integer"
        }
    },
    likesCount: {
        type: Number,
        default: 0,
        min: [0, "Likes count cannot be negative"],
        validate: {
            validator: Number.isInteger,
            message: "Likes count must be an integer"
        }
    },
    favoritesCount: {
        type: Number,
        default: 0,
        min: [0, "Favorites count cannot be negative"],
        validate: {
            validator: Number.isInteger,
            message: "Favorites count must be an integer"
        }
    },
    viewsCount: {
        type: Number,
        default: 0,
        min: [0, "Views count cannot be negative"],
        validate: {
            validator: Number.isInteger,
            message: "Views count must be an integer"
        }
    }
}, { _id: false });

const stannumVerificationSchema = new Schema({
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedAt: {
        type: Date,
        default: null
    }
}, { _id: false });

const assistantSchema = new Schema({
    title: {
        type: String,
        required: [true, "Title is required"],
        trim: true,
        minlength: [1, "Title must be at least 1 characters"],
        maxlength: [80, "Title cannot exceed 80 characters"]
    },
    description: {
        type: String,
        required: [true, "Description is required"],
        trim: true,
        minlength: [10, "Description must be at least 10 characters"],
        maxlength: [500, "Description cannot exceed 500 characters"]
    },
    assistantUrl: {
        type: String,
        required: [true, "Assistant URL is required"],
        trim: true,
        validate: {
            validator: function(v) { return /^https?:\/\/.+/.test(v); },
            message: "Assistant URL must be a valid URL"
        }
    },
    category: {
        type: String,
        enum: {
            values: [
                'sales',
                'productivity',
                'marketing',
                'innovation',
                'leadership',
                'strategy',
                'automation',
                'content',
                'analysis',
                'growth'
            ],
            message: "Invalid category"
        },
        required: [true, "Category is required"]
    },
    difficulty: {
        type: String,
        enum: {
            values: ['basic', 'intermediate', 'advanced'],
            message: "Difficulty must be: basic, intermediate or advanced"
        },
        required: [true, "Difficulty level is required"],
        default: 'basic'
    },
    platform: {
        type: String,
        enum: {
            values: [
                'chatgpt',
                'claude',
                'gemini',
                'poe',
                'perplexity',
                'other'
            ],
            message: "Invalid platform"
        },
        required: [true, "Platform is required"]
    },
    tags: {
        type: [{
            type: String,
            lowercase: true,
            trim: true,
            maxlength: [30, "Each tag cannot exceed 30 characters"],
            validate: {
                validator: function(v) { return /^[a-záéíóúüñ0-9\s\-_.]+$/.test(v) },
                message: "Tags can only contain lowercase letters, numbers, hyphens and underscores"
            }
        }],
        validate: {
            validator: function(tags) { return tags.length <= 10; },
            message: "Cannot add more than 10 tags"
        }
    },
    useCases: {
        type: String,
        maxlength: [1000, "Use cases cannot exceed 1000 characters"]
    },
    metrics: {
        type: metricsSchema,
        default: () => ({
            clicksCount: 0,
            likesCount: 0,
            favoritesCount: 0,
            viewsCount: 0
        })
    },
    author: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, "Author is required"]
    },
    likedBy: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    favoritedBy: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    status: {
        type: Boolean,
        default: true,
    },
    visibility: {
        type: String,
        enum: {
            values: ['published', 'draft', 'hidden'],
            message: "Visibility must be: published, draft or hidden"
        },
        default: 'published',
        required: true
    },
    stannumVerified: {
        type: stannumVerificationSchema,
        default: () => ({
            isVerified: false,
            verifiedAt: null,
        })
    },
    searchKeywords: [{
        type: String,
        lowercase: true,
        trim: true
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

assistantSchema.index({ category: 1, difficulty: 1 });
assistantSchema.index({ tags: 1 });
assistantSchema.index({ author: 1, createdAt: -1 });
assistantSchema.index({ status: 1, visibility: 1 });
assistantSchema.index({ 'metrics.clicksCount': -1 });
assistantSchema.index({ 'metrics.likesCount': -1 });
assistantSchema.index({ 'metrics.viewsCount': -1 });
assistantSchema.index({ createdAt: -1 });
assistantSchema.index({ 'stannumVerified.isVerified': 1 });

assistantSchema.virtual('popularityScore').get(function() {
    const verifiedBonus = this.stannumVerified.isVerified ? 100 : 0;
    return (this.metrics.clicksCount * 3) + 
           (this.metrics.likesCount * 2) + 
           this.metrics.favoritesCount + 
           (this.metrics.viewsCount * 0.1) +
           verifiedBonus;
});

assistantSchema.virtual('engagementRate').get(function() {
    if (this.metrics.viewsCount === 0) return 0;
    const interactions = this.metrics.clicksCount + this.metrics.likesCount + this.metrics.favoritesCount;
    return (interactions / this.metrics.viewsCount * 100).toFixed(2);
});

assistantSchema.methods.incrementClicks = function() {
    this.metrics.clicksCount += 1;
    return this.save();
};

assistantSchema.methods.incrementViews = function() {
    this.metrics.viewsCount += 1;
    return this.save();
};

assistantSchema.methods.addLike = function(userId) {
    if (this.likedBy.includes(userId)) return Promise.reject(new Error('User already liked this assistant'));
    this.likedBy.push(userId);
    this.metrics.likesCount += 1;
    return this.save();
};

assistantSchema.methods.removeLike = function(userId) {
    const index = this.likedBy.indexOf(userId);
    if (index === -1) return Promise.reject(new Error('User has not liked this assistant'));
    
    this.likedBy.splice(index, 1);
    this.metrics.likesCount = Math.max(0, this.metrics.likesCount - 1);
    return this.save();
};

assistantSchema.methods.addFavorite = function(userId) {
    if (this.favoritedBy.includes(userId)) return Promise.reject(new Error('Assistant already in favorites'));
    this.favoritedBy.push(userId);
    this.metrics.favoritesCount += 1;
    return this.save();
};

assistantSchema.methods.removeFavorite = function(userId) {
    const index = this.favoritedBy.indexOf(userId);
    if (index === -1) return Promise.reject(new Error('Assistant not in favorites'));
    this.favoritedBy.splice(index, 1);
    this.metrics.favoritesCount = Math.max(0, this.metrics.favoritesCount - 1);
    return this.save();
};

assistantSchema.methods.hasUserLiked = function(userId) {
    return this.likedBy.includes(userId);
};

assistantSchema.methods.hasUserFavorited = function(userId) {
    return this.favoritedBy.includes(userId);
};

assistantSchema.methods.softDelete = function() {
    this.status = false;
    return this.save();
};

assistantSchema.methods.hide = function() {
    if (this.visibility === 'published') {
        this.visibility = 'hidden';
        return this.save();
    }
    return Promise.reject(new Error('Assistant is not published'));
};

assistantSchema.methods.publish = function() {
    if (this.visibility !== 'published') {
        this.visibility = 'published';
        return this.save();
    }
    return Promise.reject(new Error('Assistant is already published'));
};

assistantSchema.methods.setDraft = function() {
    this.visibility = 'draft';
    return this.save();
};

assistantSchema.methods.verifyByStannum = function() {
    this.stannumVerified.isVerified = true;
    this.stannumVerified.verifiedAt = new Date();
    return this.save();
};

assistantSchema.methods.removeStannumVerification = function() {
    this.stannumVerified.isVerified = false;
    this.stannumVerified.verifiedAt = null;
    return this.save();
};

assistantSchema.statics.search = function(query, filters = {}) {
    const searchCriteria = { 
        status: true,
        visibility: 'published'
    };
    
    if (query) searchCriteria.$text = { $search: query };
    if (filters.category) searchCriteria.category = filters.category;
    if (filters.difficulty) searchCriteria.difficulty = filters.difficulty;
    if (filters.tags && filters.tags.length) searchCriteria.tags = { $in: filters.tags };
    if (filters.platform) searchCriteria.platform = filters.platform;
    if (filters.stannumVerifiedOnly) searchCriteria['stannumVerified.isVerified'] = true;
    
    let sortConfig = {};
    switch (filters.sortBy) {
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
    
    return this.find(searchCriteria).populate('author', 'username profile.name preferences.hasProfilePhoto').sort(sortConfig);
};

assistantSchema.statics.getByAuthor = function(authorId, includeHidden = false) {
    const criteria = { 
        author: authorId,
        status: true
    };
    
    if (!includeHidden) criteria.visibility = { $in: ['published', 'draft'] };
    return this.find(criteria).sort({ createdAt: -1 });
};

assistantSchema.statics.getTopAssistants = function(limit = 10) {
    return this.find({ 
        status: true,
        visibility: 'published'
    })
    .sort({ 
        'stannumVerified.isVerified': -1,
        'metrics.clicksCount': -1,
        'metrics.likesCount': -1 
    })
    .limit(limit)
    .populate('author', 'username profile.name preferences.hasProfilePhoto');
};

assistantSchema.methods.getFullDetails = function(userId = null) {
    const details = {
        id: this._id,
        title: this.title,
        description: this.description,
        assistantUrl: this.assistantUrl,
        category: this.category,
        difficulty: this.difficulty,
        platform: this.platform,
        tags: this.tags,
        useCases: this.useCases,
        metrics: this.metrics,
        author: {
            id: this.author._id,
            username: this.author.username,
            name: this.author.profile?.name,
            profilePhotoUrl: this.author.profilePhotoUrl
        },
        visibility: this.visibility,
        stannumVerified: this.stannumVerified,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        popularityScore: this.popularityScore,
        engagementRate: this.engagementRate
    };
    
    if (userId) {
        details.userActions = {
            hasLiked: this.hasUserLiked(userId),
            hasFavorited: this.hasUserFavorited(userId)
        };
    }
    
    return details;
};

assistantSchema.methods.getPreview = function(userId = null) {
    const preview = {
        id: this._id,
        title: this.title,
        description: this.description,
        assistantUrl: this.assistantUrl,
        category: this.category,
        difficulty: this.difficulty,
        platform: this.platform,
        useCases: this.useCases,
        tags: this.tags.slice(0, 4),
        metrics: this.metrics,
        author: {
            username: this.author.username,
            profilePhotoUrl: this.author.profilePhotoUrl
        },
        stannumVerified: this.stannumVerified.isVerified,
        createdAt: this.createdAt
    };
    
    if (userId) {
        preview.userActions = {
            hasLiked: this.hasUserLiked(userId),
            hasFavorited: this.hasUserFavorited(userId)
        };
    }
    
    return preview;
};

module.exports = model('Assistant', assistantSchema);