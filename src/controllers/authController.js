const { request, response } = require("express");
const bcryptjs = require("bcryptjs");
const axios = require("axios");

const { newJWT } = require("../helpers/newJWT");
const { getError } = require("../helpers/getError");
const User = require("../models/userModel");

const login = async (req = request, res = response) => {
  const { username, password } = req.body;
  try {
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));

    if (!password) return res.status(400).json(getError("VALIDATION_PASSWORD_REQUIRED"));

    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: username.toLowerCase() },
      ],
    });

    if (!user || !user.status || !(await bcryptjs.compare(password, user.password))) return res.status(401).json(getError("AUTH_INVALID_CREDENTIALS"));

    const token = await newJWT(user.id, user.role);
    if (!token) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    return res.status(200).json({ success: true, token });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const checkEmailExists = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));

  if (email.length > 254) return res.status(400).json(getError("VALIDATION_EMAIL_TOO_LONG"));

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

  try {
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) return res.status(409).json(getError("AUTH_EMAIL_ALREADY_EXISTS"));

    return res.status(200).json({ success: true, message: "Email is available." });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const checkUsernameExists = async (req, res) => {
  const { username } = req.body;

  if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));

  const usernameRegex = /^[a-z0-9._]+$/;
  if (!usernameRegex.test(username)) return res.status(400).json(getError("VALIDATION_USERNAME_INVALID"));

  if (username.length < 6 || username.length > 25) return res.status(400).json(getError("VALIDATION_USERNAME_LENGTH"));

  try {
    const userExists = await User.findOne({ username: username.toLowerCase().trim() });
    if (userExists) return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));
    return res.status(200).json({ success: true, message: "Username is available." });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const verifyReCAPTCHA = async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).json(getError("VALIDATION_RECAPTCHA_REQUIRED"));
  try {
    const googleVerifyUrl = "https://www.google.com/recaptcha/api/siteverify";
    const response = await axios.post(googleVerifyUrl, null, {
      params: {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: token,
      },
    });

    if (!response.data.success) {
      const recaptchaErrorCode = response.data["error-codes"]?.[0] || "unknown-error";
      const errorCodesMapping = {
        "invalid-input-response": "VALIDATION_RECAPTCHA_INVALID",
        "missing-input-response": "VALIDATION_RECAPTCHA_REQUIRED",
        "timeout-or-duplicate": "VALIDATION_RECAPTCHA_TIMEOUT",
      };
      const customErrorCode = errorCodesMapping[recaptchaErrorCode] || "VALIDATION_RECAPTCHA_UNKNOWN";
      return res.status(400).json(getError(customErrorCode));
    }

    return res.status(200).json({ success: true, message: "ReCAPTCHA validated successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const createUser = async (req = request, res = response) => {
  const { email, username, password, name, birthdate, country, region, enterprise, enterpriseRole, aboutme } = req.body;

  try {
    if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));
    if (!password) return res.status(400).json(getError("VALIDATION_PASSWORD_REQUIRED"));

    const [existingEmail, existingUsername] = await Promise.all([
      User.findOne({ email: email.toLowerCase().trim() }),
      User.findOne({ username: username.toLowerCase().trim() }),
    ]);

    if (existingEmail) return res.status(409).json(getError("AUTH_EMAIL_ALREADY_EXISTS"));
    if (existingUsername) return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));

    const birthDateObject = new Date(birthdate);
    const age = new Date().getFullYear() - birthDateObject.getFullYear();
    if (isNaN(birthDateObject.getTime()) || age < 18) return res.status(400).json(getError("VALIDATION_BIRTHDATE_INVALID"));

    const hashedPassword = await bcryptjs.hash(password, 10);

    const newUser = new User({
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      password: hashedPassword,
      profile: {
        name: name.trim(),
        country: country.trim(),
        region: region.trim(),
        birthdate: birthDateObject,
        aboutMe: aboutme.trim(),
      },
      enterprise: {
        name: enterprise.trim(),
        jobPosition: enterpriseRole.trim(),
      },
    });

    await newUser.save();

    const token = await newJWT(newUser.id, newUser.role);
    if (!token) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    return res.status(201).json({ success: true, token, message: "User created successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { login, checkEmailExists, checkUsernameExists, verifyReCAPTCHA, createUser };