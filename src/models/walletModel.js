const { pool } = require("../config/db");

const findByUserId = async (userId) => {
  const result = await pool.query(
    "SELECT * FROM wallets WHERE user_id = $1",
    [userId]
  );
  return result.rows[0];
};

const saveWallet = async (userId, balance = 0.00) => {
  const result = await pool.query(
    "INSERT INTO wallets (user_id, balance) VALUES ($1, $2) RETURNING *",
    [userId, balance]
  );
  return result.rows[0];
};

const updateBalance = async (userId, amount) => {
  const result = await pool.query(
    "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2 RETURNING *",
    [amount, userId]
  );
  return result.rows[0];
};

const setBalance = async (userId, balance) => {
  const result = await pool.query(
    "UPDATE wallets SET balance = $1 WHERE user_id = $2 RETURNING *",
    [balance, userId]
  );
  return result.rows[0];
};

const updateStatus = async (userId, status) => {
  const result = await pool.query(
    "UPDATE wallets SET status = $1 WHERE user_id = $2 RETURNING *",
    [status, userId]
  );
  return result.rows[0];
};

const freeze = async (userId) => {
  return await updateStatus(userId, 'frozen');
};

const unfreeze = async (userId) => {
  return await updateStatus(userId, 'active');
};

const block = async (userId) => {
  return await updateStatus(userId, 'blocked');
};

const unblock = async (userId) => {
  return await updateStatus(userId, 'active');
};

const checkStatus = async (userId) => {
  const wallet = await findByUserId(userId);
  return wallet ? wallet.status : null;
};

module.exports = {
  findByUserId,
  saveWallet,
  updateBalance,
  setBalance,
  updateStatus,
  freeze,
  unfreeze,
  block,
  unblock,
  checkStatus,
};
