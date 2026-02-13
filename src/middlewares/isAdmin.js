const { getError } = require("../helpers/getError");

const isAdmin = (req, res, next) => {
  const user = req.userAuth;
  if (!user) return res.status(401).json(getError("AUTH_TOKEN_REQUIRED"));

  const { role } = user;
  if (role !== "ADMIN") return res.status(403).json(getError("AUTH_ADMIN_REQUIRED"));

  next();
};

module.exports = { isAdmin };