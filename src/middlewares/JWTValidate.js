const jwt = require("jsonwebtoken");
const { request, response } = require("express");
const User = require("../models/userModel");

const JWTValidate = async (req = request, res = response, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(400).json({ message: "Token required.", token: true });

    const { id } = jwt.verify(token, process.env.SECRET);

    const user = await User.findById(id);

    if (!user) return res.status(401).json({ message: "Token invalid.", token: true });

    if (!user.status) return res.status(401).json({ message: "Token invalid.", token: true });
  Z
    req.userAuth = user;
    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ message: "Token invalid.", token: true });
  }
};

module.exports = { JWTValidate };
