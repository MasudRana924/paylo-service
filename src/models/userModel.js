const { pool } = require("../config/db");

const findByPhone = async (phone) => {
  const result = await pool.query(
    "SELECT id, phone, pin, name, profile_image, user_type, otp, isverified, last_otp_sent_at, fcm_token FROM users WHERE phone = $1",
    [phone]
  );
  return result.rows[0];
};

const findById = async (id) => {
  const result = await pool.query(
    "SELECT id, phone, pin, name, profile_image, user_type, otp, isverified, last_otp_sent_at, fcm_token FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0];
};

const saveUser = async (userData) => {
  const { phone, pin, name, user_type, fcm_token } = userData;
  const result = await pool.query(
    "INSERT INTO users (phone, pin, name, user_type, fcm_token) VALUES ($1, $2, $3, $4, $5) RETURNING id, phone, name, user_type, fcm_token",
    [phone, pin, name || null, user_type || "User", fcm_token || null]
  );
  return result.rows[0];
};

const updateOTP = async (phone, otp) => {
  const result = await pool.query(
    "UPDATE users SET otp = $1, last_otp_sent_at = CURRENT_TIMESTAMP WHERE phone = $2 RETURNING *",
    [otp, phone]
  );
  return result.rows[0];
};

const verifyUser = async (phone) => {
  const result = await pool.query(
    "UPDATE users SET isVerified = TRUE, otp = NULL WHERE phone = $1 RETURNING *",
    [phone]
  );
  return result.rows[0];
};

const updateFcmToken = async (userId, fcmToken) => {
  const result = await pool.query(
    "UPDATE users SET fcm_token = $1 WHERE id = $2 RETURNING *",
    [fcmToken, userId]
  );
  return result.rows[0];
};

const updateProfileImage = async (userId, profileImage) => {
  const result = await pool.query(
    "UPDATE users SET profile_image = $1 WHERE id = $2 RETURNING *",
    [profileImage, userId]
  );
  return result.rows[0];
};

const getUserType = async (phone) => {
  const result = await pool.query(
    "SELECT id, phone, name, profile_image, user_type, fcm_token FROM users WHERE phone = $1",
    [phone]
  );
  return result.rows[0];
};

const updateUserType = async (phone, userType) => {
  const result = await pool.query(
    "UPDATE users SET user_type = $1 WHERE phone = $2 RETURNING *",
    [userType, phone]
  );
  return result.rows[0];
};

const getAllFcmTokens = async () => {
  const result = await pool.query(
    "SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND fcm_token != ''"
  );
  return result.rows.map(row => row.fcm_token);
};

module.exports = {
  findByPhone,
  findById,
  saveUser,
  updateOTP,
  verifyUser,
  updateFcmToken,
  updateProfileImage,
  getUserType,
  updateUserType,
  getAllFcmTokens,
};
