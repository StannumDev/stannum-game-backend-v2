// src/models/promptModel.js
const { Schema, model } = require("mongoose");

const metricsSchema = new Schema({
  copiesCount: {
    type: Number,
    default: 0,
    min: [0, "Copies count cannot be negative"],
    validate: {
      validator: Number.isInteger,
      message: "Copies count must be an integer"
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

const promptSchema = new Schema({
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
    minlength: [5, "Title must be at least 5 characters"],
    maxlength: [80, "Title cannot exceed 80 characters"]
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    trim: true,
    minlength: [10, "Description must be at least 10 characters"],
    maxlength: [200, "Description cannot exceed 200 characters"]
  },
  content: {
    type: String,
    required: [true, "Prompt content is required"],
    minlength: [10, "Prompt must be at least 10 characters"],
    maxlength: [8000, "Prompt cannot exceed 8000 characters"]
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
  platforms: {
    type: [{
      type: String,
      enum: {
        values: [
          'chatgpt',
          'claude',
          'gemini',
          'notion-ai',
          'midjourney',
          'gpt-4',
          'custom-gpt',
          'other'
        ],
        message: "Invalid platform"
      }
    }],
    validate: {
      validator: function(platforms) {
        // Validate at least one platform
        return platforms.length > 0;
      },
      message: "Must select at least one compatible platform"
    }
  },
  customGptUrl: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: "Custom GPT URL must be a valid URL"
    }
  },
  tags: {
    type: [{
      type: String,
      lowercase: true,
      trim: true,
      maxlength: [30, "Each tag cannot exceed 30 characters"],
      validate: {
        validator: function(v) {
          return /^[a-z0-9-_]+$/.test(v);
        },
        message: "Tags can only contain lowercase letters, numbers, hyphens and underscores"
      }
    }],
    validate: {
      validator: function(tags) {
        return tags.length <= 10;
      },
      message: "Cannot add more than 10 tags"
    }
  },
  exampleOutput: {
    type: String,
    maxlength: [2000, "Example output cannot exceed 2000 characters"]
  },
  metrics: {
    type: metricsSchema,
    default: () => ({
      copiesCount: 0,
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
  isActive: {
    type: Boolean,
    default: true
  },
  isModerated: {
    type: Boolean,
    default: false
  },
  moderationNotes: {
    type: String,
    maxlength: [500, "Moderation notes cannot exceed 500 characters"]
  },
  isPublic: {
    type: Boolean,
    default: true
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

promptSchema.index({ category: 1, difficulty: 1 });
promptSchema.index({ tags: 1 });
promptSchema.index({ author: 1, createdAt: -1 });
promptSchema.index({ isActive: 1, isPublic: 1 });
promptSchema.index({ 'metrics.copiesCount': -1 });
promptSchema.index({ 'metrics.likesCount': -1 });
promptSchema.index({ 'metrics.viewsCount': -1 });
promptSchema.index({ createdAt: -1 });
promptSchema.index({ 
  title: 'text', 
  description: 'text', 
  tags: 'text',
  searchKeywords: 'text'
});

promptSchema.virtual('popularityScore').get(function() {
  return (this.metrics.copiesCount * 3) + 
         (this.metrics.likesCount * 2) + 
         this.metrics.favoritesCount +
         (this.metrics.viewsCount * 0.1);
});

promptSchema.virtual('engagementRate').get(function() {
  if (this.metrics.viewsCount === 0) return 0;
  const interactions = this.metrics.copiesCount + 
                      this.metrics.likesCount + 
                      this.metrics.favoritesCount;
  return (interactions / this.metrics.viewsCount * 100).toFixed(2);
});

promptSchema.methods.incrementCopies = function() {
  this.metrics.copiesCount += 1;
  return this.save();
};

promptSchema.methods.incrementViews = function() {
  this.metrics.viewsCount += 1;
  return this.save();
};

promptSchema.methods.addLike = function(userId) {
  if (this.likedBy.includes(userId)) {
    return Promise.reject(new Error('User already liked this prompt'));
  }
  
  this.likedBy.push(userId);
  this.metrics.likesCount += 1;
  return this.save();
};

promptSchema.methods.removeLike = function(userId) {
  const index = this.likedBy.indexOf(userId);
  if (index === -1) {
    return Promise.reject(new Error('User has not liked this prompt'));
  }
  
  this.likedBy.splice(index, 1);
  this.metrics.likesCount = Math.max(0, this.metrics.likesCount - 1);
  return this.save();
};

promptSchema.methods.addFavorite = function(userId) {
  if (this.favoritedBy.includes(userId)) {
    return Promise.reject(new Error('Prompt already in favorites'));
  }
  
  this.favoritedBy.push(userId);
  this.metrics.favoritesCount += 1;
  return this.save();
};

promptSchema.methods.removeFavorite = function(userId) {
  const index = this.favoritedBy.indexOf(userId);
  if (index === -1) {
    return Promise.reject(new Error('Prompt not in favorites'));
  }
  
  this.favoritedBy.splice(index, 1);
  this.metrics.favoritesCount = Math.max(0, this.metrics.favoritesCount - 1);
  return this.save();
};

promptSchema.methods.hasUserLiked = function(userId) {
  return this.likedBy.includes(userId);
};

promptSchema.methods.hasUserFavorited = function(userId) {
  return this.favoritedBy.includes(userId);
};

promptSchema.statics.search = function(query, filters = {}) {
  const searchCriteria = { 
    isActive: true,
    isPublic: true 
  };
  
  if (query) {
    searchCriteria.$text = { $search: query };
  }
  
  if (filters.category) {
    searchCriteria.category = filters.category;
  }
  
  if (filters.difficulty) {
    searchCriteria.difficulty = filters.difficulty;
  }
  
  if (filters.tags && filters.tags.length) {
    searchCriteria.tags = { $in: filters.tags };
  }
  
  if (filters.platforms && filters.platforms.length) {
    searchCriteria.platforms = { $in: filters.platforms };
  }
  
  let sortConfig = {};
  switch (filters.sortBy) {
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
    case 'popular':
    default:
      sortConfig = { 
        'metrics.copiesCount': -1, 
        'metrics.likesCount': -1,
        'metrics.favoritesCount': -1
      };
  }
  
  return this.find(searchCriteria).populate('author', 'username profile.name preferences.hasProfilePhoto').sort(sortConfig);
};

promptSchema.statics.getByAuthor = function(authorId) {
  return this.find({ 
    author: authorId,
    isActive: true 
  })
  .sort({ createdAt: -1 });
};

promptSchema.statics.getTopPrompts = function(limit = 10) {
  return this.find({ isActive: true, isPublic: true })
    .sort({ 
      'metrics.copiesCount': -1,
      'metrics.likesCount': -1 
    })
    .limit(limit)
    .populate('author', 'username profile.name preferences.hasProfilePhoto');
};

promptSchema.methods.getFullDetails = function(userId = null) {
  const details = {
    id: this._id,
    title: this.title,
    description: this.description,
    content: this.content,
    category: this.category,
    difficulty: this.difficulty,
    platforms: this.platforms,
    customGptUrl: this.customGptUrl,
    tags: this.tags,
    exampleOutput: this.exampleOutput,
    metrics: this.metrics,
    author: {
      id: this.author._id,
      username: this.author.username,
      name: this.author.profile?.name,
      hasProfilePhoto: this.author.preferences?.hasProfilePhoto
    },
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

promptSchema.methods.getPreview = function(userId = null) {
  const preview = {
    id: this._id,
    title: this.title,
    description: this.description,
    contentPreview: this.content.substring(0, 150) + '...',
    category: this.category,
    difficulty: this.difficulty,
    platforms: this.platforms,
    tags: this.tags.slice(0, 4),
    metrics: {
      copies: this.metrics.copiesCount,
      likes: this.metrics.likesCount,
      favorites: this.metrics.favoritesCount
    },
    author: {
      username: this.author.username,
      hasProfilePhoto: this.author.preferences?.hasProfilePhoto
    },
    createdAt: this.createdAt,
    hasCustomGpt: !!this.customGptUrl
  };
  
  if (userId) {
    preview.userActions = {
      hasLiked: this.hasUserLiked(userId),
      hasFavorited: this.hasUserFavorited(userId)
    };
  }
  
  return preview;
};

module.exports = model('Prompt', promptSchema);