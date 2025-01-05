const bcryptjs = require("bcryptjs");
const { request, response } = require("express");

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

    if (!user) return res.status(401).json(getError("AUTH_USER_NOT_FOUND"));

    if (!user.status) return res.status(401).json(getError("AUTH_ACCOUNT_DISABLED"));

    const validPassword = await bcryptjs.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json(getError("AUTH_INVALID_CREDENTIALS"));
    }

    const token = await newJWT(user.id);
    if (!token) return res.status(500).json(getError("JWT_GENERATION_ERROR"));

    return res.status(200).json({ success: true, token });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { login };