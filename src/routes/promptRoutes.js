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
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        query("category").optional().isIn(['sales', 'productivity', 'marketing', 'innovation', 'leadership', 'strategy', 'automation', 'content', 'analysis', 'growth']).withMessage("Invalid category."),
        query("difficulty").optional().isIn(['basic', 'intermediate', 'advanced']).withMessage("Invalid difficulty level."),
        query("sortBy").optional().isIn(['popular', 'newest', 'mostCopied', 'mostLiked', 'mostViewed']).withMessage("Invalid sort option."),
        query("search").optional().trim().isLength({ min: 2 }).withMessage("Search query must be at least 2 characters."),
        fieldsValidate,
    ],
    searchRateLimiter,
    promptController.getAllPrompts
);

router.get(
    "/stats",
    promptController.getStats
);

router.get(
    "/top",
    [
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        fieldsValidate,
    ],
    promptController.getTopPrompts
);

router.get(
    "/user/:userId",
    [
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
        check("description", "Description is required.").trim().not().isEmpty().withMessage("Description cannot be empty.").isLength({ min: 10, max: 200 }).withMessage("Description must be between 10 and 200 characters."),
        check("content", "Prompt content is required.").trim().not().isEmpty().withMessage("Prompt content cannot be empty.").isLength({ min: 10, max: 8000 }).withMessage("Content must be between 10 and 8000 characters."),
        check("category", "Category is required.").not().isEmpty().withMessage("Category cannot be empty.").isIn(['sales', 'productivity', 'marketing', 'innovation', 'leadership', 'strategy', 'automation', 'content', 'analysis', 'growth']).withMessage("Invalid category."),
        check("difficulty", "Difficulty is required.").optional().isIn(['basic', 'intermediate', 'advanced']).withMessage("Difficulty must be: basic, intermediate, or advanced."),
        check("platforms", "At least one platform is required.").isArray({ min: 1 }).withMessage("Platforms must be an array with at least one element.").custom((platforms) => {
            const validPlatforms = ['chatgpt', 'claude', 'gemini', 'notion-ai', 'midjourney', 'gpt-4', 'custom-gpt', 'other'];
            return platforms.every(p => validPlatforms.includes(p));
        }).withMessage("Invalid platform selected."),
        check("customGptUrl", "Custom GPT URL must be valid.").optional().isURL().withMessage("Custom GPT URL must be a valid URL."),
        check("tags", "Tags must be an array.").optional().isArray({ max: 10 }).withMessage("Cannot add more than 10 tags."),
        check("tags.*", "Each tag must be valid.").optional().trim().isLength({ min: 2, max: 30 }).withMessage("Each tag must be between 2 and 30 characters."),
        check("exampleOutput", "Example output is too long.").optional().isLength({ max: 2000 }).withMessage("Example output cannot exceed 2000 characters."),
        fieldsValidate,
    ],
    promptController.createPrompt
);

router.post(
    "/:id/copy",
    [
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