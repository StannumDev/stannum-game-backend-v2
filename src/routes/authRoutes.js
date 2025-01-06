const { Router } = require("express");
const { check } = require("express-validator");

const authController = require("../controllers/authController");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { rateLimiter } = require("../middlewares/rateLimiter");

const router = Router();

router.post(
  "/",
  [
    check("username", "Username is required.").trim().not().isEmpty(),
    check("password", "Password is required.").trim().not().isEmpty(),
    fieldsValidate,
  ],
  rateLimiter,
  authController.login
);

router.post(
  "/check-email",
  [
    check("email", "Email is required and must be valid.").trim().not().isEmpty().isEmail(),
    fieldsValidate,
  ],
  rateLimiter,
  authController.checkEmailExists
);

router.post(
  "/validate-recaptcha",
  [
    check("token", "ReCAPTCHA token is required.").trim().not().isEmpty(),
    fieldsValidate,
  ],
  rateLimiter,
  authController.verifyReCAPTCHA
);

router.post(
  "/check-username",
  [
    check("username", "Username is required.").trim().not().isEmpty().isLength({ min: 6, max: 25 }).withMessage("Username must be between 6 and 25 characters.").matches(/^[a-z0-9._]+$/).withMessage("Username can only contain lowercase letters, numbers, dots, and underscores."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.checkUsernameExists
);

module.exports = router;