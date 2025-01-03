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

    if (!user) return res.status(401).json({ message: "Datos incorrectos." });

    if (!user.status) return res.status(401).json({ message: "Cuenta desactivada." });

    const validPassword = bcryptjs.compareSync(password, user.password);
    if (!validPassword) return res.status(401).json({ message: "Datos incorrectos." });

    const token = await newJWT(user.id);
    if (!token) return res.status(500).json({ message: "Ocurrió un error inesperado." });

    return res.json({ token });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Ocurrió un error inesperado." });
  }
};

module.exports = { login };