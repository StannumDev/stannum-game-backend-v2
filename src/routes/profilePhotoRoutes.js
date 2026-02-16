const { Router } = require("express");
const { check } = require("express-validator");

const profilePhotoController = require("../controllers/profilePhotoController");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { validateJWT } = require("../middlewares/validateJWT");

const router = Router();

router.post(
    "/presign-photo",
    [
        validateJWT,
    ],
    profilePhotoController.getPresignedPhotoUrl
);

router.post(
    "/confirm-photo",
    [
        validateJWT,
    ],
    profilePhotoController.confirmPhotoUpload
);

router.get(
    "/get-photo",
    [
        validateJWT,
    ],
    profilePhotoController.getPhoto
);

router.get(
    "/get-photo/:username",
    [
        check("username", "Username is required.").trim().escape().not().isEmpty().withMessage("Username cannot be empty."),
        fieldsValidate,
    ],
    profilePhotoController.getPhotoByUsername
);

router.delete(
    "/delete-photo",
    [
        validateJWT,
    ],
    profilePhotoController.deletePhoto
);

module.exports = router;
