const { Router } = require("express");
const { validateJWT } = require("../middlewares/validateJWT");
const { rateLimiter } = require("../middlewares/rateLimiter");
const userController = require("../controllers/userController");

const router = Router();

router.get(
    "/sidebar-details",
    [
        validateJWT,
        rateLimiter
    ],
    userController.getUserSidebarDetails
);

router.get(
    "/profile/:username",
    [
        rateLimiter,
    ],
    userController.getUserDetailsByUsername
);

module.exports = router;