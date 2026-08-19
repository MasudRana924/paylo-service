const { pool } = require("../config/db");
const { redis } = require("../config/redis");

const saveTransaction = async (transactionData) => {
  const { sender_id, receiver_id, amount, transaction_type, status, sslcommerz_transaction_id, bank_transaction_id } = transactionData;
  const result = await pool.query(
    "INSERT INTO transactions (sender_id, receiver_id, amount, transaction_type, status, sslcommerz_transaction_id, bank_transaction_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
    [sender_id, receiver_id, amount, transaction_type, status, sslcommerz_transaction_id || null, bank_transaction_id || null]
  );
  const transaction = result.rows[0];

  // Invalidate cache for sender and receiver to ensure new transaction appears in their history
  try {
    const senderCacheKey = `user_transactions:${sender_id}`;
    const receiverCacheKey = `user_transactions:${receiver_id}`;
    
    await redis.del(senderCacheKey);
    console.log(`🗑️ Redis: Cache invalidated for user_transactions:${sender_id} (sender)`);
    
    if (sender_id !== receiver_id) {
      await redis.del(receiverCacheKey);
      console.log(`🗑️ Redis: Cache invalidated for user_transactions:${receiver_id} (receiver)`);
    }
  } catch (redisError) {
    console.error(`⚠️ Redis: Error invalidating cache for transaction:`, redisError.message);
  }

  return transaction;
};

const findById = async (id) => {
  const cacheKey = `transaction:${id}`;
  
  console.log(`🔍 Redis: Checking cache for transaction:${id}`);
  
  try {
    // Try to get from Redis cache first
    const cachedTransaction = await redis.get(cacheKey);
    if (cachedTransaction) {
      console.log(`✅ Redis: Cache HIT for transaction:${id}`);
      return JSON.parse(cachedTransaction);
    }
    
    console.log(`❌ Redis: Cache MISS for transaction:${id}, fetching from database`);
  } catch (redisError) {
    console.error(`⚠️ Redis: Error reading from cache for transaction:${id}:`, redisError.message);
  }

  // If not in cache or Redis error, get from database
  const result = await pool.query(
    "SELECT * FROM transactions WHERE id = $1",
    [id]
  );
  const transaction = result.rows[0];

  if (transaction) {
    try {
      // Cache in Redis with random TTL (5 minutes + random 0-15 seconds to prevent cache stampede)
      const randomTTL = 300 + Math.floor(Math.random() * 15);
      await redis.setEx(cacheKey, randomTTL, JSON.stringify(transaction));
      console.log(`💾 Redis: Cached transaction:${id} with ${randomTTL}s TTL`);
    } catch (cacheError) {
      console.error(`⚠️ Redis: Error caching transaction:${id}:`, cacheError.message);
    }
  }

  return transaction;
};

const findBySslcommerzId = async (sslcommerzTransactionId) => {
  const result = await pool.query(
    "SELECT * FROM transactions WHERE sslcommerz_transaction_id = $1",
    [sslcommerzTransactionId]
  );
  return result.rows[0];
};

const findByUserId = async (userId) => {
  const cacheKey = `user_transactions:${userId}`;
  
  console.log(`🔍 Redis: Checking cache for user_transactions:${userId}`);
  
  try {
    // Try to get from Redis cache first
    const cachedTransactions = await redis.get(cacheKey);
    if (cachedTransactions) {
      console.log(`✅ Redis: Cache HIT for user_transactions:${userId}`);
      return JSON.parse(cachedTransactions);
    }
    
    console.log(`❌ Redis: Cache MISS for user_transactions:${userId}, fetching from database`);
  } catch (redisError) {
    console.error(`⚠️ Redis: Error reading from cache for user_transactions:${userId}:`, redisError.message);
  }

  // If not in cache or Redis error, get from database
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
  const transactions = result.rows;

  if (transactions.length > 0) {
    try {
      // Cache in Redis with random TTL (5 minutes + random 0-15 seconds to prevent cache stampede)
      const randomTTL = 300 + Math.floor(Math.random() * 15);
      await redis.setEx(cacheKey, randomTTL, JSON.stringify(transactions));
      console.log(`💾 Redis: Cached user_transactions:${userId} with ${randomTTL}s TTL`);
    } catch (cacheError) {
      console.error(`⚠️ Redis: Error caching user_transactions:${userId}:`, cacheError.message);
    }
  }

  return transactions;
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
