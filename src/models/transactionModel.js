const { pool } = require("../config/db");

const saveTransaction = async (transactionData) => {
  const { sender_id, receiver_id, amount, transaction_type, status, sslcommerz_transaction_id, bank_transaction_id } = transactionData;
  const result = await pool.query(
    "INSERT INTO transactions (sender_id, receiver_id, amount, transaction_type, status, sslcommerz_transaction_id, bank_transaction_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
    [sender_id, receiver_id, amount, transaction_type, status, sslcommerz_transaction_id || null, bank_transaction_id || null]
  );
  return result.rows[0];
};

const findById = async (id) => {
  const result = await pool.query(
    "SELECT * FROM transactions WHERE id = $1",
    [id]
  );
  return result.rows[0];
};

const findBySslcommerzId = async (sslcommerzTransactionId) => {
  const result = await pool.query(
    "SELECT * FROM transactions WHERE sslcommerz_transaction_id = $1",
    [sslcommerzTransactionId]
  );
  return result.rows[0];
};

const findByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT t.*, 
      s.name as sender_name, s.phone as sender_phone,
      r.name as receiver_name, r.phone as receiver_phone
     FROM transactions t
     LEFT JOIN users s ON t.sender_id = s.id
     LEFT JOIN users r ON t.receiver_id = r.id
     WHERE t.sender_id = $1 OR t.receiver_id = $1
     ORDER BY t.created_at DESC`,
    [userId]
  );
  return result.rows;
};

const updateStatus = async (id, status) => {
  const result = await pool.query(
    "UPDATE transactions SET status = $1 WHERE id = $2 RETURNING *",
    [status, id]
  );
  return result.rows[0];
};

const updateSslcommerzDetails = async (id, sslcommerzTransactionId, bankTransactionId) => {
  const result = await pool.query(
    "UPDATE transactions SET sslcommerz_transaction_id = $1, bank_transaction_id = $2 WHERE id = $3 RETURNING *",
    [sslcommerzTransactionId, bankTransactionId, id]
  );
  return result.rows[0];
};

const updateBankTransactionId = async (id, bankTransactionId) => {
  const result = await pool.query(
    "UPDATE transactions SET bank_transaction_id = $1 WHERE id = $2 RETURNING *",
    [bankTransactionId, id]
  );
  return result.rows[0];
};

const findPendingAddMoney = async (sslcommerzTransactionId) => {
  const result = await pool.query(
    "SELECT * FROM transactions WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY' AND status = 'PENDING'",
    [sslcommerzTransactionId]
  );
  return result.rows[0];
};

const findPendingByUserIdAndId = async (userId, transactionId) => {
  const result = await pool.query(
    "SELECT * FROM transactions WHERE id = $1 AND sender_id = $2 AND transaction_type = 'ADD_MONEY' AND status = 'PENDING'",
    [transactionId, userId]
  );
  return result.rows[0];
};

const formatTransactions = (transactions, userId) => {
  return transactions.map((tx) => {
    if (tx.sender_id === userId) {
      const { sender_name, sender_phone, ...rest } = tx;
      return {
        ...rest,
        type: "sent",
      };
    } else {
      const { receiver_name, receiver_phone, ...rest } = tx;
      return {
        ...rest,
        type: "received",
      };
    }
  });
};

module.exports = {
  saveTransaction,
  findById,
  findBySslcommerzId,
  findByUserId,
  updateStatus,
  updateSslcommerzDetails,
  updateBankTransactionId,
  findPendingAddMoney,
  findPendingByUserIdAndId,
  formatTransactions,
};
