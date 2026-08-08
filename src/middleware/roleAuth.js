const { pool } = require("../config/db");

const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const user = await pool.query(
        "SELECT id, user_type FROM users WHERE id = $1",
        [req.user.userId]
      );

      if (user.rows.length === 0) {
        res.end(JSON.stringify({ error: "User not found" }));
        return;
      }

      if (!allowedRoles.includes(user.rows[0].user_type)) {
        res.end(JSON.stringify({ error: "Access denied. Insufficient permissions." }));
        return;
      }

      req.user.role = user.rows[0].user_type;
      next();
    } catch (error) {
      res.end(JSON.stringify({ error: "Authorization failed" }));
    }
  };
};

const requireSuperAdmin = async (req, res, next) => {
  try {
    const user = await pool.query(
      "SELECT id, user_type FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (user.rows.length === 0) {
      res.end(JSON.stringify({ error: "User not found" }));
      return;
    }

    if (user.rows[0].user_type !== "SuperAdmin") {
      res.end(JSON.stringify({ error: "Access denied. Super Admin only." }));
      return;
    }

    req.user.role = user.rows[0].user_type;
    next();
  } catch (error) {
    res.end(JSON.stringify({ error: "Authorization failed" }));
  }
};

const requireWalletStatusPermission = async (req, res, next) => {
  try {
    const user = await pool.query(
      "SELECT id, user_type FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (user.rows.length === 0) {
      res.end(JSON.stringify({ error: "User not found" }));
      return;
    }

    // Super Admin always has permission
    if (user.rows[0].user_type === "SuperAdmin") {
      req.user.role = user.rows[0].user_type;
      next();
      return;
    }

    // Check if Admin has permission
    if (user.rows[0].user_type === "Admin") {
      const permissions = await pool.query(
        "SELECT can_change_wallet_status FROM admin_permissions WHERE id = 1"
      );

      if (permissions.rows.length === 0 || !permissions.rows[0].can_change_wallet_status) {
        res.end(JSON.stringify({ error: "Access denied. Admin wallet status permission revoked by Super Admin." }));
        return;
      }

      req.user.role = user.rows[0].user_type;
      next();
      return;
    }

    res.end(JSON.stringify({ error: "Access denied. Insufficient permissions." }));
  } catch (error) {
    res.end(JSON.stringify({ error: "Authorization failed" }));
  }
};

module.exports = {
  requireRole,
  requireSuperAdmin,
  requireWalletStatusPermission,
};
