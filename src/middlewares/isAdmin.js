const isAdmin = (req, res, next) => {
  const user = req.userAuth;
  if (!user) return res.status(500).json({ msg: "Auth required." });

  const { role } = user;
  if (role !== "ADMIN_ROLE") return res.status(401).json({ msg: "Admin required." });

  next();
};

module.exports = { isAdmin };