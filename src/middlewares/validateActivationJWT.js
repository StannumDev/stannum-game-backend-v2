const { request, response } = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const { getError } = require("../helpers/getError");

const validateActivationJWT = async (req = request, res = response, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = req.cookies?.access_token || (authHeader && authHeader.split(' ')[1]);
    if (!token) return res.status(401).json(getError("ACTIVATION_TOKEN_REQUIRED"));

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") return res.status(401).json(getError("JWT_EXPIRED_TOKEN"));
      if (error.name === "JsonWebTokenError") return res.status(401).json(getError("JWT_INVALID_TOKEN"));
      return res.status(401).json(getError("JWT_CORRUPTED_TOKEN"));
    }

    if (decodedToken.scope !== "activation") return res.status(401).json(getError("ACTIVATION_TOKEN_REQUIRED"));

    const user = await User.findById(decodedToken.id);
    if (!user) return res.status(401).json(getError("JWT_INVALID_TOKEN"));
    if (!user.status) return res.status(401).json(getError("AUTH_ACCOUNT_DISABLED"));

    req.userAuth = user;
    next();
  } catch (error) {
    console.error("Error validating activation JWT:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { validateActivationJWT };
