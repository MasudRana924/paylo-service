const { pool } = require("../config/db");

const saveNotification = async (notificationData) => {
  const { title, description, image_url, created_by } = notificationData;
  const result = await pool.query(
    "INSERT INTO notifications (title, description, image_url, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
    [title, description, image_url, created_by]
  );
  return result.rows[0];
};

const getAll = async () => {
  const result = await pool.query(
    `SELECT n.*, u.name as created_by_name, u.phone as created_by_phone
     FROM notifications n
     LEFT JOIN users u ON n.created_by = u.id
     ORDER BY n.created_at DESC`
  );
  return result.rows;
};

const getPublic = async (limit = 20) => {
  const result = await pool.query(
    `SELECT id, title, description, image_url, created_at
     FROM notifications
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

const findById = async (id) => {
  const result = await pool.query(
    "SELECT * FROM notifications WHERE id = $1",
    [id]
  );
  return result.rows[0];
};

module.exports = {
  saveNotification,
  getAll,
  getPublic,
  findById,
};
