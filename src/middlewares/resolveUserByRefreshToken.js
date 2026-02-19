const User = require("../models/userModel");
const { hashRefreshToken } = require("../helpers/newRefreshToken");

const resolveUserByRefreshToken = async (req, res, next) => {
  try {
    const refreshTokenValue = req.cookies?.refresh_token;
    if (!refreshTokenValue) {
      req.userAuth = null;
      return next();
    }

    const hashedToken = hashRefreshToken(refreshTokenValue);
    const user = await User.findOne({ "refreshToken.token": hashedToken, status: true });

    req.userAuth = user || null;
    next();
  } catch (error) {
    req.userAuth = null;
    next();
  }
};

module.exports = { resolveUserByRefreshToken };
