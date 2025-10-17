const { Router } = require("express");
const { check, query } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { searchRateLimiter } = require("../middlewares/rateLimiter");
const promptController = require("../controllers/promptController");

const router = Router();

router.get(
    "/",
    [
        validateJWT,
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        query("category").optional().isIn(['sales', 'productivity', 'marketing', 'innovation', 'leadership', 'strategy', 'automation', 'content', 'analysis', 'growth']).withMessage("Invalid category."),
        query("difficulty").optional().isIn(['basic', 'intermediate', 'advanced']).withMessage("Invalid difficulty level."),
        query("sortBy").optional().isIn(['popular', 'newest', 'mostCopied', 'mostLiked', 'mostViewed', 'verified']).withMessage("Invalid sort option."),
        query("search").optional().trim().isLength({ min: 2 }).withMessage("Search query must be at least 2 characters."),
        query("favoritesOnly").optional().isBoolean().withMessage("favoritesOnly must be a boolean."),
        query("stannumVerifiedOnly").optional().isBoolean().withMessage("stannumVerifiedOnly must be a boolean."),
        fieldsValidate,
    ],
    searchRateLimiter,
    promptController.getAllPrompts
);

router.get(
    "/stats",
    validateJWT,
    promptController.getStats
);

router.get(
    "/top",
    [
        validateJWT,
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        fieldsValidate,
    ],
    promptController.getTopPrompts
);

router.get(
    "/user/:userId",
    [
        validateJWT,
        check("userId", "Invalid user ID.").isMongoId().withMessage("User ID must be a valid MongoDB ObjectId."),
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        fieldsValidate,
    ],
    promptController.getUserPrompts
);

router.get(
    "/me/prompts",
    [
        validateJWT,
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        fieldsValidate,
    ],
    promptController.getMyPrompts
);

router.get(
    "/me/favorites",
    validateJWT,
    promptController.getMyFavorites
);

router.get(
    "/:id",
    [
        validateJWT,
        check("id", "Invalid prompt ID.").isMongoId().withMessage("Prompt ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    promptController.getPromptById
);

router.post(
    "/",
    [
        validateJWT,
        check("title", "Title is required.").trim().not().isEmpty().withMessage("Title cannot be empty.").isLength({ min: 5, max: 80 }).withMessage("Title must be between 5 and 80 characters."),
        check("description", "Description is required.").trim().not().isEmpty().withMessage("Description cannot be empty.").isLength({ min: 10, max: 500 }).withMessage("Description must be between 10 and 500 characters."),
        check("content", "Prompt content is required.").trim().not().isEmpty().withMessage("Content cannot be empty.").isLength({ min: 10, max: 8000 }).withMessage("Content must be between 10 and 8000 characters."),
        check("category", "Category is required.").not().isEmpty().withMessage("Category cannot be empty.").isIn(['sales', 'productivity', 'marketing', 'innovation', 'leadership', 'strategy', 'automation', 'content', 'analysis', 'growth']).withMessage("Invalid category."),
        check("difficulty").optional().isIn(['basic', 'intermediate', 'advanced']).withMessage("Difficulty must be: basic, intermediate, or advanced."),
        check("platforms", "At least one platform is required.").isArray({ min: 1 }).withMessage("Platforms must be an array with at least one element.").custom((platforms) => {
            const validPlatforms = ['chatgpt', 'claude', 'gemini', 'poe', 'perplexity', 'other'];
            return platforms.every(p => validPlatforms.includes(p));
        }).withMessage("Invalid platform selected."),
        check("customGptUrl").optional({ checkFalsy: true }).isURL().withMessage("Custom GPT URL must be a valid URL."),
        check("tags").optional().isArray({ max: 10 }).withMessage("Cannot add more than 10 tags."),
        check("tags.*").optional().trim().isLength({ min: 2, max: 30 }).withMessage("Each tag must be between 2 and 30 characters."),
        check("exampleOutput").optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage("Example output cannot exceed 2000 characters."),
        check("visibility").optional().isIn(['published', 'draft']).withMessage("Invalid visibility value."),
        fieldsValidate,
    ],
    promptController.createPrompt
);

router.put(
    "/:id",
    [
        validateJWT,
        check("id", "Invalid prompt ID.").isMongoId().withMessage("Prompt ID must be a valid MongoDB ObjectId."),
        check("title", "Title is required.").trim().not().isEmpty().withMessage("Title cannot be empty.").isLength({ min: 5, max: 80 }).withMessage("Title must be between 5 and 80 characters."),
        check("description", "Description is required.").trim().not().isEmpty().withMessage("Description cannot be empty.").isLength({ min: 10, max: 500 }).withMessage("Description must be between 10 and 500 characters."),
        check("content", "Prompt content is required.").trim().not().isEmpty().withMessage("Content cannot be empty.").isLength({ min: 10, max: 8000 }).withMessage("Content must be between 10 and 8000 characters."),
        check("category", "Category is required.").not().isEmpty().withMessage("Category cannot be empty.").isIn(['sales', 'productivity', 'marketing', 'innovation', 'leadership', 'strategy', 'automation', 'content', 'analysis', 'growth']).withMessage("Invalid category."),
        check("difficulty").optional().isIn(['basic', 'intermediate', 'advanced']).withMessage("Difficulty must be: basic, intermediate, or advanced."),
        check("platforms", "At least one platform is required.").isArray({ min: 1 }).withMessage("Platforms must be an array with at least one element.").custom((platforms) => {
            const validPlatforms = ['chatgpt', 'claude', 'gemini', 'poe', 'perplexity', 'other'];
            return platforms.every(p => validPlatforms.includes(p));
        }).withMessage("Invalid platform selected."),
        check("customGptUrl").optional({ checkFalsy: true }).isURL().withMessage("Custom GPT URL must be a valid URL."),
        check("tags").optional().isArray({ max: 10 }).withMessage("Cannot add more than 10 tags."),
        check("tags.*").optional().trim().isLength({ min: 2, max: 30 }).withMessage("Each tag must be between 2 and 30 characters."),
        check("exampleOutput").optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage("Example output cannot exceed 2000 characters."),
        fieldsValidate,
    ],
    promptController.updatePrompt
);

router.post(
    "/:id/copy",
    [
        validateJWT,
        check("id", "Invalid prompt ID.").isMongoId().withMessage("Prompt ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    promptController.copyPrompt
);

router.post(
    "/:id/like",
    [
        validateJWT,
        check("id", "Invalid prompt ID.").isMongoId().withMessage("Prompt ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    promptController.likePrompt
);

router.delete(
    "/:id/like",
    [
        validateJWT,
        check("id", "Invalid prompt ID.").isMongoId().withMessage("Prompt ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    promptController.unlikePrompt
);

router.post(
    "/:id/favorite",
    [
        validateJWT,
        check("id", "Invalid prompt ID.").isMongoId().withMessage("Prompt ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    promptController.toggleFavorite
);

router.put(
    "/:id/visibility",
    [
        validateJWT,
        check("id", "Invalid prompt ID.").isMongoId().withMessage("Prompt ID must be a valid MongoDB ObjectId."),
        check("visibility", "Visibility is required.").isIn(['published', 'draft', 'hidden']).withMessage("Invalid visibility value."),
        fieldsValidate,
    ],
    promptController.toggleVisibility
);

router.delete(
    "/:id",
    [
        validateJWT,
        check("id", "Invalid prompt ID.").isMongoId().withMessage("Prompt ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    promptController.deletePrompt
);

module.exports = router;