const { Router } = require("express");
const { check } = require("express-validator");

const authController = require("../controllers/authController");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const { loginLimiter } = require("../middlewares/loginLimiter");

const router = Router();

router.post(
  "/",
  [
    check("username", "username is required.").trim().not().isEmpty(),
    check("password", "password is required.").trim().not().isEmpty(),
    fieldsValidate,
  ],
  loginLimiter,
  authController.login
);

module.exports = router;