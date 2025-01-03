const bcryptjs = require("bcryptjs");
const { request, response } = require("express");

const { newJWT } = require("../helpers/newJWT");
const User = require("../models/userModel");

const login = async (req = request, res = response) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: username.toLowerCase() }
      ]
    });

    if (!user) return res.status(401).json({ success: false, message: "Datos incorrectos." });
    if (!user.status) return res.status(403).json({ success: false, message: "Esta cuenta se encuentra actualmente suspendida. Ponte en contacto con soporte." });

    const validPassword = await bcryptjs.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ success: false, message: "Datos incorrectos." });
    
    const token = await newJWT(user.id);
    if (!token) return res.status(500).json({ success: false, message: "An unexpected error occurred while generating the token" });

    return res.status(200).json({
      success: true,
      token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "An unexpected error occurred" });
  }
};

module.exports = { login };