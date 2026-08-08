const jwt = require("jsonwebtoken");

const JWT_SECRET = "masud924";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.writeHead(401);
    res.end(JSON.stringify({ errorMessage: "Access token required" }));
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      res.writeHead(403);
      res.end(JSON.stringify({ errorMessage: "Invalid token" }));
      return;
    }

    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };
