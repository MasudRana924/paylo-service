const jwt = require("jsonwebtoken");

const JWT_SECRET = "masud924";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ errorMessage: "Access token required" });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      res.status(403).json({ errorMessage: "Invalid token" });
      return;
    }

    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };
