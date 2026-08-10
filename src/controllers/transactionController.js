const { pool } = require("../config/db");
const {
  sendMoneyReceivedNotification,
  sendMoneySentNotification,
} = require("../helpers/notificationHelper");
const { redis } = require("../config/redis");
const { findByPhone, findById } = require("../models/userModel");
const { findByUserId, updateBalance } = require("../models/walletModel");
const { saveTransaction, findByUserId: findTransactionsByUserId, formatTransactions } = require("../models/transactionModel");

const checkUserType = (req, res, userType, responseKey) => {
  const data = req.body;

  findByPhone(data.phone).then(user => {
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.user_type !== userType) {
      res.status(400).json({ error: `This is not a ${userType} account` });
      return;
    }

    if (user.id === req.user.userId) {
      res.status(400).json({ error: "Cannot send to yourself" });
      return;
    }

    res.status(200).json({
      message: `${userType} found`,
      [responseKey]: user,
    });
  }).catch(error => {
    res.status(500).json({ error: "Internal server error" });
  });
};

const executeTransaction = async (req, res, receiverType, transactionType) => {
  const data = req.body;

  try {
    const sender = await findById(req.user.userId);
    
    if (!sender) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (sender.user_type !== "Personal") {
      res.status(400).json({ error: "Only Personal accounts can send money" });
      return;
    }

    if (sender.pin !== data.pin) {
      res.status(401).json({ error: "Invalid PIN" });
      return;
    }

    const receiverPhone = data.phone || data.receiverPhone;

    const receiver = await findByPhone(receiverPhone);
    
    if (!receiver || receiver.user_type !== receiverType) {
      res.status(404).json({ error: `Receiver not found or not ${receiverType}` });
      return;
    }

    if (receiver.id === req.user.userId) {
      res.status(400).json({ error: "Cannot send to yourself" });
      return;
    }

    const senderWallet = await findByUserId(sender.id);

    if (!senderWallet) {
      res.status(404).json({ error: "Sender wallet not found" });
      return;
    }

    if (senderWallet.status === "blocked") {
      res.status(403).json({
        error: "Your wallet is blocked. No transactions allowed.",
      });
      return;
    }

    if (senderWallet.status === "frozen") {
      res.status(403).json({ error: "Your wallet is frozen. Cannot send money." });
      return;
    }

    if (senderWallet.balance < data.amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const receiverWallet = await findByUserId(receiver.id);

    if (!receiverWallet) {
      res.status(404).json({ error: "Receiver wallet not found" });
      return;
    }

    if (receiverWallet.status === "blocked") {
      res.status(403).json({
        error: "Receiver wallet is blocked. Cannot receive money.",
      });
      return;
    }

    await pool.query("BEGIN");

    try {
      await pool.query(
        "UPDATE wallets SET balance = balance - $1 WHERE user_id = $2",
        [data.amount, sender.id]
      );

      await pool.query(
        "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
        [data.amount, receiver.id]
      );

      await saveTransaction({
        sender_id: sender.id,
        receiver_id: receiver.id,
        amount: data.amount,
        transaction_type: transactionType,
        status: "completed"
      });

      // Invalidate cache for both sender and receiver
      await redis.del(`wallet:${sender.id}`);
      await redis.del(`wallet:${receiver.id}`);
      console.log('Wallet cache invalidated for sender and receiver');

      await pool.query("COMMIT");

      console.log("Sender FCM Token:", sender.fcm_token);
      console.log("Receiver FCM Token:", receiver.fcm_token);

      try {
        await sendMoneyReceivedNotification(
          receiver.fcm_token,
          sender.name,
          data.amount
        );
        await sendMoneySentNotification(
          sender.fcm_token,
          receiver.name,
          data.amount
        );
      } catch (notificationError) {
        console.error("Notification error:", notificationError);
      }

      res.status(200).json({
        successMessage: "Transaction successful",
        amount: data.amount,
        transactionType,
      });
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error("Transaction error:", err);
      res.status(500).json({ errorMessage: "Transaction failed" });
    }
  } catch (error) {
    console.error("Execute transaction error:", error);
    res.status(500).json({ errorMessage: "Internal server error" });
  }
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
  try {
    const { userId } = req.user;
    const transactions = await findTransactionsByUserId(userId);

    const formattedTransactions = formatTransactions(transactions, userId);

    res.status(200).json({
      message: "Transaction history",
      transactions: formattedTransactions,
    });
  } catch (error) {
    console.error("Transaction history error:", error);
    res.status(500).json({ errorMessage: "Error fetching transaction history" });
  }
};

module.exports = { handleCheckReceiver, handleSendMoney, handleMerchantCheck, handleCheckAgent, handlePaymentLink, handleCashout, transactionHistory };
