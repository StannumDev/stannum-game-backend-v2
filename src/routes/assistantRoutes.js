const { Router } = require("express");
const { check, query } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { searchRateLimiter } = require("../middlewares/rateLimiter");
const assistantController = require("../controllers/assistantController");

const router = Router();

router.get(
    "/",
    [
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        query("category").optional().isIn(['sales', 'productivity', 'marketing', 'innovation', 'leadership', 'strategy', 'automation', 'content', 'analysis', 'growth']).withMessage("Invalid category."),
        query("difficulty").optional().isIn(['basic', 'intermediate', 'advanced']).withMessage("Invalid difficulty level."),
        query("sortBy").optional().isIn(['popular', 'newest', 'mostUsed', 'mostLiked', 'mostViewed']).withMessage("Invalid sort option."),
        query("search").optional().trim().isLength({ min: 2 }).withMessage("Search query must be at least 2 characters."),
        fieldsValidate,
    ],
    searchRateLimiter,
    assistantController.getAllAssistants
);

router.get(
    "/stats",
    assistantController.getStats
);

router.get(
    "/top",
    [
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        fieldsValidate,
    ],
    assistantController.getTopAssistants
);

router.get(
    "/user/:userId",
    [
        check("userId", "Invalid user ID.").isMongoId().withMessage("User ID must be a valid MongoDB ObjectId."),
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        fieldsValidate,
    ],
    assistantController.getUserAssistants
);

router.get(
    "/me/assistants",
    [
        validateJWT,
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
        query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50."),
        fieldsValidate,
    ],
    assistantController.getMyAssistants
);

router.get(
    "/me/favorites",
    validateJWT,
    assistantController.getMyFavorites
);

router.get(
    "/:id",
    [
        check("id", "Invalid assistant ID.").isMongoId().withMessage("Assistant ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    assistantController.getAssistantById
);

router.post(
    "/",
    [
        validateJWT,
        check("title", "Title is required.").trim().not().isEmpty().withMessage("Title cannot be empty.").isLength({ min: 5, max: 80 }).withMessage("Title must be between 5 and 80 characters."),
        check("description", "Description is required.").trim().not().isEmpty().withMessage("Description cannot be empty.").isLength({ min: 10, max: 500 }).withMessage("Description must be between 10 and 500 characters."),
        check("assistantUrl", "Assistant URL is required.").trim().not().isEmpty().withMessage("Assistant URL cannot be empty.").isURL().withMessage("Assistant URL must be a valid URL."),
        check("category", "Category is required.").not().isEmpty().withMessage("Category cannot be empty.").isIn(['sales', 'productivity', 'marketing', 'innovation', 'leadership', 'strategy', 'automation', 'content', 'analysis', 'growth']).withMessage("Invalid category."),
        check("difficulty", "Difficulty is required.").optional().isIn(['basic', 'intermediate', 'advanced']).withMessage("Difficulty must be: basic, intermediate, or advanced."),
        check("platforms", "At least one platform is required.").isArray({ min: 1 }).withMessage("Platforms must be an array with at least one element.").custom((platforms) => {
            const validPlatforms = ['chatgpt', 'claude', 'gemini', 'poe', 'perplexity', 'other'];
            return platforms.every(p => validPlatforms.includes(p));
        }).withMessage("Invalid platform selected."),
        check("tags", "Tags must be an array.").optional().isArray({ max: 10 }).withMessage("Cannot add more than 10 tags."),
        check("tags.*", "Each tag must be valid.").optional().trim().isLength({ min: 2, max: 30 }).withMessage("Each tag must be between 2 and 30 characters."),
        check("useCases", "Use cases are too long.").optional().isLength({ max: 1000 }).withMessage("Use cases cannot exceed 1000 characters."),
        fieldsValidate,
    ],
    assistantController.createAssistant
);

router.post(
    "/:id/click",
    [
        check("id", "Invalid assistant ID.").isMongoId().withMessage("Assistant ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    assistantController.clickAssistant
);

router.post(
    "/:id/like",
    [
        validateJWT,
        check("id", "Invalid assistant ID.").isMongoId().withMessage("Assistant ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    assistantController.likeAssistant
);

router.delete(
    "/:id/like",
    [
        validateJWT,
        check("id", "Invalid assistant ID.").isMongoId().withMessage("Assistant ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    assistantController.unlikeAssistant
);

router.post(
    "/:id/favorite",
    [
        validateJWT,
        check("id", "Invalid assistant ID.").isMongoId().withMessage("Assistant ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    assistantController.toggleFavorite
);

router.delete(
    "/:id",
    [
        validateJWT,
        check("id", "Invalid assistant ID.").isMongoId().withMessage("Assistant ID must be a valid MongoDB ObjectId."),
        fieldsValidate,
    ],
    assistantController.deleteAssistant
);

module.exports = router;