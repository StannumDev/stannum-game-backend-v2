const { Router } = require("express");
const { check } = require("express-validator");
const authController = require("../controllers/authController");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { rateLimiter } = require("../middlewares/rateLimiter");
const { validateJWT } = require("../middlewares/validateJWT");

const router = Router();

router.post(
  "/",
  [
    check("username", "Username is required.").trim().escape().not().isEmpty().withMessage("Username cannot be empty."),
    check("password", "Password is required.").trim().escape().not().isEmpty().withMessage("Password cannot be empty."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.login
);

router.post(
  "/check-email",
  [
    check("email", "Email is required and must be valid.").trim().escape().not().isEmpty().withMessage("Email cannot be empty.").isEmail().withMessage("Email format is invalid."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.checkEmailExists
);

router.post(
  "/validate-recaptcha",
  [
    check("token", "ReCAPTCHA token is required.").trim().escape().not().isEmpty().withMessage("ReCAPTCHA token cannot be empty."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.verifyReCAPTCHA
);

router.post(
  "/validate-username",
  [
    check("username", "Username is required.").trim().escape().customSanitizer(value => value.replace(/\s+/g, ' ')).not().isEmpty().withMessage("Username cannot be empty.").isLength({ min: 6, max: 25 }).withMessage("Username must be between 6 and 25 characters.").matches(/^[a-z0-9._]+$/).withMessage("Username can only contain lowercase letters, numbers, dots, and underscores."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.validateUsername
);

router.post(
  "/register",
  [
    check("email", "Email is required and must be valid.").trim().escape().not().isEmpty().withMessage("Email cannot be empty.").isEmail().withMessage("Email format is invalid."),
    check("username", "Username is required.").trim().escape().customSanitizer(value => value.replace(/\s+/g, ' ')).not().isEmpty().withMessage("Username cannot be empty.").isLength({ min: 6, max: 25 }).withMessage("Username must be between 6 and 25 characters.").matches(/^[a-z0-9._]+$/).withMessage("Username can only contain lowercase letters, numbers, dots, and underscores."),
    check("password", "Password is required and must be valid.").trim().escape().not().isEmpty().withMessage("Password cannot be empty.").isLength({ min: 8, max: 50 }).withMessage("Password must be between 8 and 50 characters.").matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,50}$/).withMessage("Password must include at least one lowercase letter, one uppercase letter, and one number."),
    check("name", "El nombre debe tener entre 2 y 50 caracteres.").optional().trim().escape().customSanitizer(value => value.replace(/\s+/g, ' ')).isLength({ min: 2, max: 50 }).withMessage("El nombre debe tener entre 2 y 50 caracteres.").matches(/^[\p{L}\s]+$/u).withMessage("El nombre solo puede contener letras y espacios."),
    check("birthdate", "Birthdate is required.").trim().escape().not().isEmpty().withMessage("Birthdate cannot be empty.")
      .custom((value) => {
        const today = new Date();
        const birthDate = new Date(value);
        const age = today.getFullYear() - birthDate.getFullYear();
        if (age < 18) throw new Error("You must be at least 18 years old.");
        if (birthDate > today) throw new Error("Birthdate cannot be in the future.");
        return true;
      }),
    check("country", "Country is required.").trim().escape().not().isEmpty().withMessage("Country cannot be empty."),
    check("region", "Region is required.").trim().escape().not().isEmpty().withMessage("Region cannot be empty."),
    check("enterprise", "Enterprise is required.").trim().customSanitizer(value => value.replace(/\s+/g, ' ')).escape().not().isEmpty().withMessage("Enterprise cannot be empty.").isLength({ max: 100 }).withMessage("Enterprise must be less than 100 characters."),
    check("enterpriseRole", "Enterprise role is required.").trim().customSanitizer(value => value.replace(/\s+/g, ' ')).escape().not().isEmpty().withMessage("Enterprise role cannot be empty.").isLength({ max: 50 }).withMessage("Enterprise role must be less than 50 characters."),
    check("aboutme", "About me is required.").trim().escape().customSanitizer(value => value.replace(/(?<!\n)\s{2,}(?!\n)/g, ' ')).not().isEmpty().withMessage("About me cannot be empty.").isLength({ max: 2600 }).withMessage("About me must be less than 2600 characters."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.createUser
);

router.post(
  "/password-recovery",
  [
    check("username", "Username or email is required.").trim().escape().not().isEmpty().withMessage("Username or email cannot be empty."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.sendPasswordRecoveryEmail
);

router.post(
  "/verify-recovery-otp",
  [
    check("username", "Username or email is required.").trim().escape().not().isEmpty().withMessage("Username or email cannot be empty."),
    check("otp", "OTP is required and must be exactly 6 digits.").isLength({ min: 6, max: 6 }).matches(/^\d{6}$/).withMessage("OTP must be a 6-digit number."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.verifyRecoveryOtp
);

router.post(
  "/password-reset",
  [
    check("username", "Username or email is required.").trim().escape().not().isEmpty().withMessage("Username or email cannot be empty."),
    check("otp", "OTP is required.").isLength({ min: 6, max: 6 }).matches(/^\d{6}$/).withMessage("OTP must be a 6-digit number."),
    check("password", "Password is required and must be valid.").isLength({ min: 8, max: 50 }).withMessage("Password must be between 8 and 50 characters.").matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage("Password must include at least one lowercase letter, one uppercase letter, and one number."),
    fieldsValidate,
  ],
  rateLimiter,
  authController.resetPassword
);

router.post(
  '/google',
  rateLimiter,
  authController.googleAuth
);

router.put(
  "/update-username",
  [
    validateJWT,
    check("username", "Username is required.").trim().escape().customSanitizer(value => value.replace(/\s+/g, " ")).not().isEmpty().withMessage("Username cannot be empty.").isLength({ min: 6, max: 25 }).withMessage("Username must be between 6 and 25 characters.").matches(/^[a-z0-9._]+$/).withMessage("Username can only contain lowercase letters, numbers, dots, and underscores."),
    fieldsValidate,
  ],
  authController.updateUsername
);


module.exports = router;