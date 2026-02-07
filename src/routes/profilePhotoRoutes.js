const { Router } = require("express");
const { check } = require("express-validator");

const profilePhotoController = require("../controllers/profilePhotoController");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { rateLimiter } = require("../middlewares/rateLimiter");
const { validateJWT } = require("../middlewares/validateJWT");

const router = Router();

router.post(
    "/presign-photo",
    [
        validateJWT,
    ],
    rateLimiter,
    profilePhotoController.getPresignedPhotoUrl
);

router.post(
    "/confirm-photo",
    [
        validateJWT,
    ],
    rateLimiter,
    profilePhotoController.confirmPhotoUpload
);

router.get(
    "/get-photo",
    [
        validateJWT,
    ],
    rateLimiter,
    profilePhotoController.getPhoto
);

router.get(
    "/get-photo/:username",
    [
        check("username", "Username is required.").trim().escape().not().isEmpty().withMessage("Username cannot be empty."),
        fieldsValidate,
    ],
    rateLimiter,
    profilePhotoController.getPhotoByUsername
);

router.delete(
    "/delete-photo",
    [
        validateJWT,
    ],
    rateLimiter,
    profilePhotoController.deletePhoto
);

module.exports = router;