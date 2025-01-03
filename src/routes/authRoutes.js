const { Router } = require("express");
const { check } = require("express-validator");

const { fieldsValidate } = require("../middlewares/fieldsValidate");
const authController = require("../controllers/authController");

const router = Router();

router.post(
  "/",
  [
    check("username", "username is required.").trim().not().isEmpty(),
    check("password", "password is required.").trim().not().isEmpty(),
    fieldsValidate,
  ],
  authController.login
);

module.exports = router;