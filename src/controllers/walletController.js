const { pool } = require("../config/db");
const { createPaymentSession, validateTransaction } = require("../helpers/sslcommerzHelper");

const getBalance = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const wallet = await pool.query(
        "SELECT * FROM wallets WHERE user_id = $1",
        [req.user.userId],
      );

      if (wallet.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Wallet not found" }));
        return;
      }

      res.end(
        JSON.stringify({
          successMessage: "Balance retrieved successfully",
          balance: wallet.rows[0].balance,
          status: wallet.rows[0].status,
        }),
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error retrieving balance" }));
    }
  });
};

const freezeWallet = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const wallet = await pool.query(
        "UPDATE wallets SET status = 'frozen' WHERE user_id = $1 RETURNING *",
        [data.userId],
      );

      if (wallet.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Wallet not found" }));
        return;
      }

      res.end(
        JSON.stringify({
          successMessage: "Wallet frozen successfully",
          wallet: wallet.rows[0],
        }),
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error freezing wallet" }));
    }
  });
};

const unfreezeWallet = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const wallet = await pool.query(
        "UPDATE wallets SET status = 'active' WHERE user_id = $1 RETURNING *",
        [data.userId],
      );

      if (wallet.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Wallet not found" }));
        return;
      }

      res.end(
        JSON.stringify({
          successMessage: "Wallet unfrozen successfully",
          wallet: wallet.rows[0],
        }),
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error unfreezing wallet" }));
    }
  });
};

const blockWallet = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const wallet = await pool.query(
        "UPDATE wallets SET status = 'blocked' WHERE user_id = $1 RETURNING *",
        [data.userId],
      );

      if (wallet.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Wallet not found" }));
        return;
      }

      res.end(
        JSON.stringify({
          successMessage: "Wallet blocked successfully",
          wallet: wallet.rows[0],
        }),
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error blocking wallet" }));
    }
  });
};

const unblockWallet = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const wallet = await pool.query(
        "UPDATE wallets SET status = 'active' WHERE user_id = $1 RETURNING *",
        [data.userId],
      );

      if (wallet.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Wallet not found" }));
        return;
      }

      res.end(
        JSON.stringify({
          successMessage: "Wallet unblocked successfully",
          wallet: wallet.rows[0],
        }),
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error unblocking wallet" }));
    }
  });
};

const addMoney = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const { amount } = data;
      const userId = req.user.userId;

      // Validate amount
      if (!amount || isNaN(amount) || amount <= 0) {
        res.end(JSON.stringify({ errorMessage: "Invalid amount" }));
        return;
      }

      // Check wallet status
      const wallet = await pool.query(
        "SELECT * FROM wallets WHERE user_id = $1",
        [userId]
      );

      if (wallet.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Wallet not found" }));
        return;
      }

      if (wallet.rows[0].status === "blocked") {
        res.end(JSON.stringify({ errorMessage: "Wallet is blocked" }));
        return;
      }

      if (wallet.rows[0].status === "frozen") {
        res.end(JSON.stringify({ errorMessage: "Wallet is frozen" }));
        return;
      }

      // Get user details
      const user = await pool.query(
        "SELECT name, phone FROM users WHERE id = $1",
        [userId]
      );

      if (user.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "User not found" }));
        return;
      }

      // Generate unique transaction ID
      const transactionId = `ADD_${Date.now()}_${userId}`;

      await pool.query("BEGIN");

      try {
        // Credit wallet immediately (for learning project)
        await pool.query(
          "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
          [amount, userId]
        );

        // Create PENDING transaction
        const transactionResult = await pool.query(
          "INSERT INTO transactions (sender_id, receiver_id, amount, transaction_type, status) VALUES ($1, $1, $2, $3, $4) RETURNING id",
          [userId, amount, "ADD_MONEY", "PENDING"]
        );

        const dbTransactionId = transactionResult.rows[0].id;

        // Create SSLCOMMERZ payment session
        const paymentSession = await createPaymentSession(
          transactionId,
          amount,
          userId,
          null,
          user.rows[0].name,
          user.rows[0].phone
        );

        // Update transaction with SSLCOMMERZ transaction ID
        await pool.query(
          "UPDATE transactions SET sslcommerz_transaction_id = $1 WHERE id = $2",
          [transactionId, dbTransactionId]
        );

        await pool.query("COMMIT");

        res.end(
          JSON.stringify({
            success: true,
            transactionId: dbTransactionId,
            sslcommerzTransactionId: transactionId,
            paymentUrl: paymentSession.paymentUrl,
            message: "Money added to wallet (Learning mode - no SSLCOMMERZ validation)",
          })
        );
      } catch (err) {
        await pool.query("ROLLBACK");
        console.error("Add money transaction error:", err);
        res.end(JSON.stringify({ errorMessage: err.message || "Failed to add money" }));
      }
    } catch (error) {
      console.error("Add money error:", error);
      res.end(JSON.stringify({ errorMessage: error.message || "Failed to initiate add money" }));
    }
  });
};

const handleSSLCOMMERZSuccess = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const params = new URLSearchParams(body);
      const tranId = params.get("tran_id");
      const amount = params.get("amount");
      const currency = params.get("currency");
      const cardType = params.get("card_type");
      const bankTranId = params.get("bank_tran_id");
      const valueA = params.get("value_a"); // userId

      if (!tranId) {
        res.end(JSON.stringify({ errorMessage: "Transaction ID missing" }));
        return;
      }

      // Find the pending transaction
      const transaction = await pool.query(
        "SELECT * FROM transactions WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY'",
        [tranId]
      );

      if (transaction.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Transaction not found" }));
        return;
      }

      const tx = transaction.rows[0];

      // Check if already processed
      if (tx.status !== "PENDING") {
        res.end(JSON.stringify({ message: "Transaction already processed" }));
        return;
      }

      // Validate with SSLCOMMERZ
      const validation = await validateTransaction(tranId);

      if (!validation || validation.status !== "VALID" || validation.element[0].status !== "VALIDATED") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Transaction validation failed" }));
        return;
      }

      const validationData = validation.element[0];

      // Verify amount
      if (parseFloat(validationData.amount) !== parseFloat(tx.amount)) {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Amount mismatch" }));
        return;
      }

      // Verify currency
      if (validationData.currency !== "BDT") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Currency mismatch" }));
        return;
      }

      // Start transaction
      await pool.query("BEGIN");

      try {
        // Update wallet balance
        await pool.query(
          "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
          [tx.amount, tx.sender_id]
        );

        // Update transaction status
        await pool.query(
          "UPDATE transactions SET status = 'SUCCESS', bank_transaction_id = $1 WHERE id = $2",
          [bankTranId, tx.id]
        );

        await pool.query("COMMIT");

        res.end(
          JSON.stringify({
            success: true,
            message: "Money added successfully",
            amount: tx.amount,
          })
        );
      } catch (err) {
        await pool.query("ROLLBACK");
        res.end(JSON.stringify({ errorMessage: "Failed to credit wallet" }));
      }
    } catch (error) {
      console.error("SSLCOMMERZ success callback error:", error);
      res.end(JSON.stringify({ errorMessage: "Internal server error" }));
    }
  });
};

const handleSSLCOMMERZFail = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const params = new URLSearchParams(body);
      const tranId = params.get("tran_id");

      if (!tranId) {
        res.end(JSON.stringify({ errorMessage: "Transaction ID missing" }));
        return;
      }

      // Update transaction status to FAILED
      await pool.query(
        "UPDATE transactions SET status = 'FAILED' WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY'",
        [tranId]
      );

      res.end(JSON.stringify({ message: "Payment failed" }));
    } catch (error) {
      console.error("SSLCOMMERZ fail callback error:", error);
      res.end(JSON.stringify({ errorMessage: "Internal server error" }));
    }
  });
};

const handleSSLCOMMERZCancel = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const params = new URLSearchParams(body);
      const tranId = params.get("tran_id");

      if (!tranId) {
        res.end(JSON.stringify({ errorMessage: "Transaction ID missing" }));
        return;
      }

      // Update transaction status to CANCELLED
      await pool.query(
        "UPDATE transactions SET status = 'CANCELLED' WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY'",
        [tranId]
      );

      res.end(JSON.stringify({ message: "Payment cancelled" }));
    } catch (error) {
      console.error("SSLCOMMERZ cancel callback error:", error);
      res.end(JSON.stringify({ errorMessage: "Internal server error" }));
    }
  });
};

const handleSSLCOMMERZIPN = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const params = new URLSearchParams(body);
      const tranId = params.get("tran_id");
      const amount = params.get("amount");
      const currency = params.get("currency");
      const bankTranId = params.get("bank_tran_id");
      const status = params.get("status");

      if (!tranId) {
        res.end(JSON.stringify({ errorMessage: "Transaction ID missing" }));
        return;
      }

      // Find the pending transaction
      const transaction = await pool.query(
        "SELECT * FROM transactions WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY'",
        [tranId]
      );

      if (transaction.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Transaction not found" }));
        return;
      }

      const tx = transaction.rows[0];

      // Check if already processed
      if (tx.status !== "PENDING") {
        res.end(JSON.stringify({ message: "Transaction already processed" }));
        return;
      }

      // Handle failed/cancelled status
      if (status === "FAILED") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ message: "Payment failed" }));
        return;
      }

      if (status === "CANCELLED") {
        await pool.query(
          "UPDATE transactions SET status = 'CANCELLED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ message: "Payment cancelled" }));
        return;
      }

      // Validate with SSLCOMMERZ for successful payments
      const validation = await validateTransaction(tranId);

      if (!validation || validation.status !== "VALID" || validation.element[0].status !== "VALIDATED") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Transaction validation failed" }));
        return;
      }

      const validationData = validation.element[0];

      // Verify amount
      if (parseFloat(validationData.amount) !== parseFloat(tx.amount)) {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Amount mismatch" }));
        return;
      }

      // Verify currency
      if (validationData.currency !== "BDT") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Currency mismatch" }));
        return;
      }

      // Start transaction
      await pool.query("BEGIN");

      try {
        // Update wallet balance
        await pool.query(
          "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
          [tx.amount, tx.sender_id]
        );

        // Update transaction status
        await pool.query(
          "UPDATE transactions SET status = 'SUCCESS', bank_transaction_id = $1 WHERE id = $2",
          [bankTranId, tx.id]
        );

        await pool.query("COMMIT");

        res.end(JSON.stringify({ message: "IPN processed successfully" }));
      } catch (err) {
        await pool.query("ROLLBACK");
        res.end(JSON.stringify({ errorMessage: "Failed to credit wallet" }));
      }
    } catch (error) {
      console.error("SSLCOMMERZ IPN error:", error);
      res.end(JSON.stringify({ errorMessage: "Internal server error" }));
    }
  });
};

const manualProcessTransaction = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const { transactionId } = data;
      const userId = req.user.userId;

      // Find the pending transaction
      const transaction = await pool.query(
        "SELECT * FROM transactions WHERE id = $1 AND sender_id = $2 AND transaction_type = 'ADD_MONEY'",
        [transactionId, userId]
      );

      if (transaction.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Transaction not found" }));
        return;
      }

      const tx = transaction.rows[0];

      // Check if already processed
      if (tx.status !== "PENDING") {
        res.end(JSON.stringify({ message: "Transaction already processed", status: tx.status }));
        return;
      }

      // Validate with SSLCOMMERZ
      const validation = await validateTransaction(tx.sslcommerz_transaction_id);

      if (!validation || validation.status !== "VALID" || validation.element[0].status !== "VALIDATED") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Transaction validation failed" }));
        return;
      }

      const validationData = validation.element[0];

      // Verify amount
      if (parseFloat(validationData.amount) !== parseFloat(tx.amount)) {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Amount mismatch" }));
        return;
      }

      // Verify currency
      if (validationData.currency !== "BDT") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Currency mismatch" }));
        return;
      }

      // Start transaction
      await pool.query("BEGIN");

      try {
        // Update wallet balance
        await pool.query(
          "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
          [tx.amount, tx.sender_id]
        );

        // Update transaction status
        await pool.query(
          "UPDATE transactions SET status = 'SUCCESS', bank_transaction_id = $1 WHERE id = $2",
          [validationData.bank_tran_id, tx.id]
        );

        await pool.query("COMMIT");

        res.end(
          JSON.stringify({
            success: true,
            message: "Money added successfully",
            amount: tx.amount,
          })
        );
      } catch (err) {
        await pool.query("ROLLBACK");
        res.end(JSON.stringify({ errorMessage: "Failed to credit wallet" }));
      }
    } catch (error) {
      console.error("Manual process transaction error:", error);
      res.end(JSON.stringify({ errorMessage: error.message || "Internal server error" }));
    }
  });
};

const manualTriggerSuccess = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const { sslcommerzTransactionId } = data;

      if (!sslcommerzTransactionId) {
        res.end(JSON.stringify({ errorMessage: "SSLCOMMERZ transaction ID required" }));
        return;
      }

      // Find the pending transaction
      const transaction = await pool.query(
        "SELECT * FROM transactions WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY'",
        [sslcommerzTransactionId]
      );

      if (transaction.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Transaction not found" }));
        return;
      }

      const tx = transaction.rows[0];

      // Check if already processed
      if (tx.status !== "PENDING") {
        res.end(JSON.stringify({ message: "Transaction already processed", status: tx.status }));
        return;
      }

      // Validate with SSLCOMMERZ
      const validation = await validateTransaction(sslcommerzTransactionId);

      if (!validation || validation.status !== "VALID" || validation.element[0].status !== "VALIDATED") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Transaction validation failed" }));
        return;
      }

      const validationData = validation.element[0];

      // Verify amount
      if (parseFloat(validationData.amount) !== parseFloat(tx.amount)) {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Amount mismatch" }));
        return;
      }

      // Verify currency
      if (validationData.currency !== "BDT") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        res.end(JSON.stringify({ errorMessage: "Currency mismatch" }));
        return;
      }

      // Start transaction
      await pool.query("BEGIN");

      try {
        // Update wallet balance
        await pool.query(
          "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
          [tx.amount, tx.sender_id]
        );

        // Update transaction status
        await pool.query(
          "UPDATE transactions SET status = 'SUCCESS', bank_transaction_id = $1 WHERE id = $2",
          [validationData.bank_tran_id, tx.id]
        );

        await pool.query("COMMIT");

        res.end(
          JSON.stringify({
            success: true,
            message: "Money added successfully via manual callback",
            amount: tx.amount,
          })
        );
      } catch (err) {
        await pool.query("ROLLBACK");
        res.end(JSON.stringify({ errorMessage: "Failed to credit wallet" }));
      }
    } catch (error) {
      console.error("Manual trigger success error:", error);
      res.end(JSON.stringify({ errorMessage: error.message || "Internal server error" }));
    }
  });
};

module.exports = { getBalance, freezeWallet, unfreezeWallet, blockWallet, unblockWallet, addMoney, handleSSLCOMMERZSuccess, handleSSLCOMMERZFail, handleSSLCOMMERZCancel, handleSSLCOMMERZIPN, manualProcessTransaction, manualTriggerSuccess };
