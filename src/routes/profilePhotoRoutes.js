const { Router } = require("express");
const { check } = require("express-validator");
const multer = require("multer");

const profilePhotoController = require("../controllers/profilePhotoController");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { rateLimiter } = require("../middlewares/rateLimiter");
const { validateJWT } = require("../middlewares/validateJWT");
const { getError } = require("../helpers/getError");

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.post(
    "/upload-photo",
    [
        validateJWT,
        upload.single("photo"),
        check("photo")
            .custom((_, { req }) => {
                if (!req.file) throw getError("PHOTO_REQUIRED");
                const fileSizeInMB = req.file.size / (1024 * 1024);
                if (fileSizeInMB > 20) throw getError("PHOTO_FILE_TOO_LARGE");
                if (!["image/jpeg", "image/png"].includes(req.file.mimetype)) throw getError("PHOTO_INVALID_FORMAT");
                return true;
            }),
        fieldsValidate,
    ],
    rateLimiter,
    profilePhotoController.uploadProfilePhoto
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