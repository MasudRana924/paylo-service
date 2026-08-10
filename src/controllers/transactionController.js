const { pool } = require("../config/db");
const {
  sendMoneyReceivedNotification,
  sendMoneySentNotification,
} = require("../helpers/notificationHelper");
const { redis } = require("../config/redis");

const checkUserType = (req, res, userType, responseKey) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const data = JSON.parse(body);

    const user = await pool.query(
      "SELECT id, phone, name, profile_image, user_type, fcm_token FROM users WHERE phone = $1",
      [data.phone],
    );

    if (user.rows.length === 0) {
      res.end(JSON.stringify({ error: "User not found" }));
      return;
    }

    if (user.rows[0].user_type !== userType) {
      res.end(JSON.stringify({ error: `This is not a ${userType} account` }));
      return;
    }

    if (user.rows[0].id === req.user.userId) {
      res.end(JSON.stringify({ error: "Cannot send to yourself" }));
      return;
    }

    res.end(
      JSON.stringify({
        message: `${userType} found`,
        [responseKey]: user.rows[0],
      }),
    );
  });
};

const executeTransaction = async (req, res, receiverType, transactionType) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const data = JSON.parse(body);

    const sender = await pool.query(
      "SELECT id, phone, pin, name, profile_image, user_type, fcm_token FROM users WHERE id = $1",
      [req.user.userId]
    );
    if (sender.rows.length === 0) {
      res.end(JSON.stringify({ error: "User not found" }));
      return;
    }

    if (sender.rows[0].user_type !== "Personal") {
      res.end(JSON.stringify({ error: "Only Personal accounts can send money" }));
      return;
    }

    if (sender.rows[0].pin !== data.pin) {
      res.end(JSON.stringify({ error: "Invalid PIN" }));
      return;
    }

    const receiverPhone = data.phone || data.receiverPhone;

    const receiver = await pool.query(
      "SELECT id, phone, name, profile_image, user_type, fcm_token FROM users WHERE phone = $1 AND user_type = $2",
      [receiverPhone, receiverType]
    );
    if (receiver.rows.length === 0) {
      res.end(JSON.stringify({ error: `Receiver not found or not ${receiverType}` }));
      return;
    }

    if (receiver.rows[0].id === req.user.userId) {
      res.end(JSON.stringify({ error: "Cannot send to yourself" }));
      return;
    }

    const senderWallet = await pool.query(
      "SELECT * FROM wallets WHERE user_id = $1",
      [sender.rows[0].id]
    );

    if (senderWallet.rows.length === 0) {
      res.end(JSON.stringify({ error: "Sender wallet not found" }));
      return;
    }

    if (senderWallet.rows[0].status === "blocked") {
      res.end(
        JSON.stringify({
          error: "Your wallet is blocked. No transactions allowed.",
        })
      );
      return;
    }

    if (senderWallet.rows[0].status === "frozen") {
      res.end(JSON.stringify({ error: "Your wallet is frozen. Cannot send money." }));
      return;
    }

    if (senderWallet.rows[0].balance < data.amount) {
      res.end(JSON.stringify({ error: "Insufficient balance" }));
      return;
    }

    const receiverWallet = await pool.query(
      "SELECT * FROM wallets WHERE user_id = $1",
      [receiver.rows[0].id]
    );

    if (receiverWallet.rows.length === 0) {
      res.end(JSON.stringify({ error: "Receiver wallet not found" }));
      return;
    }

    if (receiverWallet.rows[0].status === "blocked") {
      res.end(
        JSON.stringify({
          error: "Receiver wallet is blocked. Cannot receive money.",
        })
      );
      return;
    }

    await pool.query("BEGIN");

    try {
      await pool.query(
        "UPDATE wallets SET balance = balance - $1 WHERE user_id = $2",
        [data.amount, sender.rows[0].id]
      );

      await pool.query(
        "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
        [data.amount, receiver.rows[0].id]
      );

      await pool.query(
        "INSERT INTO transactions (sender_id, receiver_id, amount, transaction_type, status) VALUES ($1, $2, $3, $4, $5)",
        [
          sender.rows[0].id,
          receiver.rows[0].id,
          data.amount,
          transactionType,
          "completed",
        ]
      );

      // Invalidate cache for both sender and receiver
      await redis.del(`wallet:${sender.rows[0].id}`);
      await redis.del(`wallet:${receiver.rows[0].id}`);
      console.log('Wallet cache invalidated for sender and receiver');

      await pool.query("COMMIT");

      console.log("Sender FCM Token:", sender.rows[0].fcm_token);
      console.log("Receiver FCM Token:", receiver.rows[0].fcm_token);

      try {
        await sendMoneyReceivedNotification(
          receiver.rows[0].fcm_token,
          sender.rows[0].name,
          data.amount
        );
      } catch (error) {
        console.error("Failed to send notification to receiver:", error);
      }

      try {
        await sendMoneySentNotification(
          sender.rows[0].fcm_token,
          receiver.rows[0].name,
          data.amount
        );
      } catch (error) {
        console.error("Failed to send notification to sender:", error);
      }

      res.end(
        JSON.stringify({
          message: `${transactionType === 'payment_link' ? 'Payment link' : transactionType === 'cashout' ? 'Cashout' : 'Send money'} successful`,
          amount: data.amount,
          receiverPhone: receiver.rows[0].phone,
          receiverName: receiver.rows[0].name,
        })
      );
    } catch (err) {
      await pool.query("ROLLBACK");
      res.end(JSON.stringify({ error: "Transaction failed" }));
    }
  });
};

const handleCheckReceiver = (req, res) => {
  checkUserType(req, res, "Personal", "receiver");
};

const handleSendMoney = (req, res) => {
  executeTransaction(req, res, "Personal", "send_money");
};


const handleMerchantCheck = (req, res) => {
  checkUserType(req, res, "Merchant", "merchant");
};

const handleCheckAgent = (req, res) => {
  checkUserType(req, res, "Agent", "agent");
};
const handlePaymentLink = (req, res) => {
  executeTransaction(req, res, "Merchant", "payment_link");
};

const handleCashout = (req, res) => {
  executeTransaction(req, res, "Agent", "cashout");
};

const transactionHistory = async (req, res) => {
  const { userId } = req.user;
  const transactions = await pool.query(
    `SELECT t.*, 
      s.name as sender_name, s.phone as sender_phone,
      r.name as receiver_name, r.phone as receiver_phone
     FROM transactions t
     LEFT JOIN users s ON t.sender_id = s.id
     LEFT JOIN users r ON t.receiver_id = r.id
     WHERE t.sender_id = $1 OR t.receiver_id = $1
     ORDER BY t.created_at DESC`,
    [userId],
  );

  const formattedTransactions = transactions.rows.map((tx) => {
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

  res.end(
    JSON.stringify({
      message: "Transaction history",
      transactions: formattedTransactions,
    }),
  );
};

module.exports = { handleCheckReceiver, handleSendMoney, handleMerchantCheck, handleCheckAgent, handlePaymentLink, handleCashout, transactionHistory };
