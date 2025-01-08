const { request, response } = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const { getError } = require("../helpers/getError");

const validateJWT = async (req = request, res = response, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(400).json(getError("JWT_MISSING_TOKEN"));

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") return res.status(401).json(getError("JWT_EXPIRED_TOKEN"));
      if (error.name === "JsonWebTokenError") return res.status(401).json(getError("JWT_INVALID_TOKEN"));
      return res.status(401).json(getError("JWT_CORRUPTED_TOKEN"));
    }

    const { id } = decodedToken;
    const user = await User.findById(id);

    if (!user) return res.status(401).json(getError("JWT_INVALID_TOKEN"));
    if (!user.status) return res.status(401).json(getError("AUTH_ACCOUNT_DISABLED"));

    req.userAuth = user;
    next();
  } catch (error) {
    console.error("Error validating JWT:", error);
    const serverError = getError("SERVER_INTERNAL_ERROR");
    return res.status(500).json(serverError);
  }
};

module.exports = { validateJWT };