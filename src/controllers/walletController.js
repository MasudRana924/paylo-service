const { pool } = require("../config/db");
const { findByUserId, saveWallet, updateBalance, freeze, unfreeze, block, unblock } = require("../models/walletModel");
const { saveTransaction, findById, findBySslcommerzId, updateStatus, updateBankTransactionId, updateSslcommerzDetails, findPendingByUserIdAndId } = require("../models/transactionModel");
const { createPaymentSession, validateTransaction } = require("../helpers/sslcommerzHelper");

const getBalance = async (req, res) => {
  try {
    const userId = req.user.userId;
    const wallet = await findByUserId(userId);

    if (!wallet) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
    }

    res.status(200).json({
      successMessage: "Balance retrieved successfully",
      balance: wallet.balance,
      status: wallet.status,
    });
  } catch (error) {
    console.error("Get balance error:", error);
    res.status(500).json({ errorMessage: "Error retrieving balance" });
  }
};

const freezeWallet = async (req, res) => {
  try {
    const wallet = await freeze(req.user.userId);

    if (!wallet) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
    }

    res.status(200).json({
      successMessage: "Wallet frozen successfully",
      wallet: wallet,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error freezing wallet" });
  }
};

const unfreezeWallet = async (req, res) => {
  try {
    const data = req.body;
    const wallet = await unfreeze(data.userId);

    if (!wallet) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
    }

    res.status(200).json({
      successMessage: "Wallet unfrozen successfully",
      wallet: wallet,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error unfreezing wallet" });
  }
};

const blockWallet = async (req, res) => {
  try {
    const data = req.body;
    const wallet = await block(data.userId);

    if (!wallet) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
    }

    res.status(200).json({
      successMessage: "Wallet blocked successfully",
      wallet: wallet,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error blocking wallet" });
  }
};

const unblockWallet = async (req, res) => {
  try {
    const data = req.body;
    const wallet = await unblock(data.userId);

    if (!wallet) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
    }

    res.status(200).json({
      successMessage: "Wallet unblocked successfully",
      wallet: wallet,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error unblocking wallet" });
  }
};

const addMoney = async (req, res) => {
  try {
    const data = req.body;
    const { amount } = data;
    const userId = req.user.userId;

    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      res.status(400).json({ errorMessage: "Invalid amount" });
      return;
    }

    // Check wallet status
    const wallet = await pool.query(
      "SELECT * FROM wallets WHERE user_id = $1",
      [userId]
    );

    if (wallet.rows.length === 0) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
    }

    if (wallet.rows[0].status === "blocked") {
      res.status(400).json({ errorMessage: "Wallet is blocked" });
      return;
    }

    if (wallet.rows[0].status === "frozen") {
      res.status(400).json({ errorMessage: "Wallet is frozen" });
      return;
    }

    // Get user details
    const user = await pool.query(
      "SELECT name, phone FROM users WHERE id = $1",
      [userId]
    );

    if (user.rows.length === 0) {
      res.status(404).json({ errorMessage: "User not found" });
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
      const transactionResult = await saveTransaction({
        sender_id: userId,
        receiver_id: userId,
        amount: amount,
        transaction_type: "ADD_MONEY",
        status: "PENDING"
      });

      const dbTransactionId = transactionResult.id;

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
      await updateSslcommerzDetails(dbTransactionId, transactionId, null);

      await pool.query("COMMIT");

      res.status(200).json({
        success: true,
        transactionId: dbTransactionId,
        sslcommerzTransactionId: transactionId,
        paymentUrl: paymentSession.paymentUrl,
        message: "Money added to wallet (Learning mode - no SSLCOMMERZ validation)",
      });
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error("Add money transaction error:", err);
      res.status(500).json({ errorMessage: err.message || "Failed to add money" });
    }
  } catch (error) {
    console.error("Add money error:", error);
    res.status(500).json({ errorMessage: error.message || "Failed to initiate add money" });
  }
};

const handleSSLCOMMERZSuccess = async (req, res) => {
  const appDeepLink = process.env.APP_DEEP_LINK || "app.tapcash";

  const sendRedirectResponse = (tranId, status = "success", title = "Payment Successful") => {
    const redirectUrl = `${appDeepLink}://payment/${status}?transactionId=${encodeURIComponent(tranId || "")}&status=${status}`;

    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body { font-family: 'Segoe UI', Roboto, sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: white; padding: 35px 25px; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.08); text-align: center; max-width: 380px; width: 100%; }
          .icon { font-size: 48px; margin-bottom: 12px; }
          h1 { font-size: 22px; margin: 0 0 10px; color: ${status === "success" ? "#2e7d32" : "#c62828"}; }
          p { color: #555; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
          .btn { display: block; background-color: ${status === "success" ? "#2e7d32" : "#c62828"}; color: white; text-decoration: none; padding: 14px; border-radius: 10px; font-weight: 600; font-size: 16px; box-sizing: border-box; transition: background 0.2s; }
          .btn:active { opacity: 0.85; }
        </style>
        <script>
          setTimeout(function() {
            window.location.href = "${redirectUrl}";
          }, 300);
        </script>
      </head>
      <body>
        <div class="card">
          <div class="icon">${status === "success" ? "✅" : "❌"}</div>
          <h1>${title}</h1>
          <p>${status === "success" ? "Your payment was successful and credited to your wallet balance." : "Payment transaction was not completed."}</p>
          <a href="${redirectUrl}" class="btn">Return to App</a>
        </div>
      </body>
      </html>
    `);
  };

  const redirectSuccess = (tranId) => {
    sendRedirectResponse(tranId, "success", "Payment Successful");
  };

  const redirectFail = (tranId) => {
    sendRedirectResponse(tranId, "fail", "Payment Failed");
  };

  const redirectCancel = (tranId) => {
    sendRedirectResponse(tranId, "cancel", "Payment Cancelled");
  };

  try {
    const tranId = req.query.tran_id || req.body.tran_id;
    console.log("SSLCOMMERZ Success Callback:", tranId);

    if (!tranId) {
      console.error("Transaction ID missing in success callback");
      redirectFail(null);
      return;
    }

    const transaction = await findBySslcommerzId(tranId);

    if (!transaction) {
      console.error("Transaction not found:", tranId);
      redirectFail(tranId);
      return;
    }

    if (transaction.status === "SUCCESS") {
      console.log("Transaction already processed:", tranId);
      redirectSuccess(tranId);
      return;
    }

    const validation = await validateTransaction(tranId);

    if (validation.status === "VALIDATED" || validation.status === "VALID") {
      await pool.query("BEGIN");

      try {
        await pool.query(
          "UPDATE transactions SET status = 'SUCCESS', bank_transaction_id = $1 WHERE id = $2",
          [validation.bank_tran_id || null, transaction.id]
        );

        await pool.query(
          "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
          [transaction.amount, transaction.sender_id]
        );

        await pool.query("COMMIT");

        console.log("Transaction validated and wallet credited:", tranId);
        redirectSuccess(tranId);
      } catch (err) {
        await pool.query("ROLLBACK");
        console.error("Error processing transaction:", err);
        redirectFail(tranId);
      }
    } else {
      console.log("Transaction validation failed:", validation);
      redirectFail(tranId);
    }
  } catch (error) {
    console.error("SSLCOMMERZ success callback error:", error);
    redirectFail(null);
  }
};

const handleSSLCOMMERZFail = async (req, res) => {
  const appDeepLink = process.env.APP_DEEP_LINK || "app.tapcash";
  const tranId = req.query.tran_id || req.body.tran_id || "";

  if (tranId) {
    await pool.query(
      "UPDATE transactions SET status = 'FAILED' WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY' AND status = 'PENDING'",
      [tranId]
    );
  }

  const redirectUrl = `${appDeepLink}://payment/failed?transactionId=${encodeURIComponent(tranId)}&status=failed`;
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Failed</title>
      <style>
        body { font-family: 'Segoe UI', Roboto, sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; padding: 35px 25px; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.08); text-align: center; max-width: 380px; width: 100%; }
        .icon { font-size: 48px; margin-bottom: 12px; }
        h1 { font-size: 22px; margin: 0 0 10px; color: #c62828; }
        p { color: #555; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
        .btn { display: block; background-color: #c62828; color: white; text-decoration: none; padding: 14px; border-radius: 10px; font-weight: 600; font-size: 16px; box-sizing: border-box; }
      </style>
      <script>
        setTimeout(function() { window.location.href = "${redirectUrl}"; }, 300);
      </script>
    </head>
    <body>
      <div class="card">
        <div class="icon">❌</div>
        <h1>Payment Failed</h1>
        <p>Payment transaction could not be completed.</p>
        <a href="${redirectUrl}" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
};

const handleSSLCOMMERZCancel = async (req, res) => {
  const appDeepLink = process.env.APP_DEEP_LINK || "app.tapcash";
  const tranId = req.query.tran_id || req.body.tran_id || "";

  if (tranId) {
    await pool.query(
      "UPDATE transactions SET status = 'CANCELLED' WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY' AND status = 'PENDING'",
      [tranId]
    );
  }

  const redirectUrl = `${appDeepLink}://payment/cancel?transactionId=${encodeURIComponent(tranId)}&status=cancelled`;
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Cancelled</title>
      <style>
        body { font-family: 'Segoe UI', Roboto, sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; padding: 35px 25px; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.08); text-align: center; max-width: 380px; width: 100%; }
        .icon { font-size: 48px; margin-bottom: 12px; }
        h1 { font-size: 22px; margin: 0 0 10px; color: #e65100; }
        p { color: #555; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
        .btn { display: block; background-color: #e65100; color: white; text-decoration: none; padding: 14px; border-radius: 10px; font-weight: 600; font-size: 16px; box-sizing: border-box; }
      </style>
      <script>
        setTimeout(function() { window.location.href = "${redirectUrl}"; }, 300);
      </script>
    </head>
    <body>
      <div class="card">
        <div class="icon">⚠️</div>
        <h1>Payment Cancelled</h1>
        <p>You have cancelled the payment transaction.</p>
        <a href="${redirectUrl}" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
};

const handleSSLCOMMERZIPN = async (req, res) => {
  try {
    const params = new URLSearchParams(req.body);
    const tranId = params.get("tran_id");
    const amount = params.get("amount");
    const currency = params.get("currency");
    const bankTranId = params.get("bank_tran_id");
    const status = params.get("status");

    if (!tranId) {
      res.status(400).json({ errorMessage: "Transaction ID missing" });
      return;
    }

    // Find the pending transaction
    const transaction = await pool.query(
      "SELECT * FROM transactions WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY'",
      [tranId]
    );

    if (transaction.rows.length === 0) {
      res.status(404).json({ errorMessage: "Transaction not found" });
      return;
    }

    const tx = transaction.rows[0];

    // Check if already processed
    if (tx.status !== "PENDING") {
      res.status(200).json({ message: "Transaction already processed" });
      return;
    }

    // Handle failed/cancelled status
    if (status === "FAILED") {
      await pool.query(
        "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
        [tx.id]
      );
      res.status(200).json({ message: "Payment failed" });
      return;
    }

    if (status === "CANCELLED") {
      await pool.query(
        "UPDATE transactions SET status = 'CANCELLED' WHERE id = $1",
        [tx.id]
      );
      res.status(200).json({ message: "Payment cancelled" });
      return;
    }

    // Validate with SSLCOMMERZ for successful payments
    const validation = await validateTransaction(tranId);

    if (!validation || validation.status !== "VALID" || validation.element[0].status !== "VALIDATED") {
      await pool.query(
        "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
        [tx.id]
      );
      res.status(400).json({ message: "Payment validation failed" });
      return;
    }

    // Credit wallet
    await pool.query("BEGIN");

    try {
      await pool.query(
        "UPDATE transactions SET status = 'SUCCESS', bank_transaction_id = $1 WHERE id = $2",
        [bankTranId || validation.element[0].bank_tran_id || null, tx.id]
      );

      await pool.query(
        "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
        [tx.amount, tx.sender_id]
      );

      await pool.query("COMMIT");

      res.status(200).json({ message: "Payment processed successfully" });
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error("IPN processing error:", err);
      res.status(500).json({ errorMessage: "Error processing payment" });
    }
  } catch (error) {
    console.error("IPN error:", error);
    res.status(500).json({ errorMessage: "Internal server error" });
  }
};

const manualProcessTransaction = async (req, res) => {
  try {
    const data = req.body;
    const { transactionId } = data;
    const userId = req.user.userId;

    // Find the pending transaction
    const transaction = await findPendingByUserIdAndId(userId, transactionId);

    if (!transaction) {
      res.status(404).json({ errorMessage: "Transaction not found" });
      return;
    }

    const tx = transaction;

    // Check if already processed
    if (tx.status !== "PENDING") {
      res.status(200).json({ message: "Transaction already processed", status: tx.status });
      return;
    }

    // Validate with SSLCOMMERZ
    const validation = await validateTransaction(tx.sslcommerz_transaction_id);

    if (!validation || validation.status !== "VALID" || validation.element[0].status !== "VALIDATED") {
      await updateStatus(tx.id, "FAILED");
      res.status(400).json({ errorMessage: "Transaction validation failed" });
      return;
    }

    const validationData = validation.element[0];

    // Verify amount
    if (parseFloat(validationData.amount) !== parseFloat(tx.amount)) {
      await updateStatus(tx.id, "FAILED");
      res.status(400).json({ errorMessage: "Amount mismatch" });
      return;
    }

    // Verify currency
    if (validationData.currency !== "BDT") {
      await updateStatus(tx.id, "FAILED");
      res.status(400).json({ errorMessage: "Currency mismatch" });
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
      await updateStatus(tx.id, "SUCCESS");
      await updateBankTransactionId(tx.id, validationData.bank_tran_id);

      await pool.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Money added successfully",
        amount: tx.amount,
      });
    } catch (err) {
      await pool.query("ROLLBACK");
      res.status(500).json({ errorMessage: "Failed to credit wallet" });
    }
  } catch (error) {
    console.error("Manual process transaction error:", error);
    res.status(500).json({ errorMessage: error.message || "Internal server error" });
  }
};

const manualTriggerSuccess = async (req, res) => {
  try {
    const data = req.body;
    const { sslcommerzTransactionId } = data;

    if (!sslcommerzTransactionId) {
      res.status(400).json({ errorMessage: "SSLCOMMERZ transaction ID required" });
      return;
    }

    // Find the pending transaction
    const transaction = await findBySslcommerzId(sslcommerzTransactionId);

    if (!transaction) {
      res.status(404).json({ errorMessage: "Transaction not found" });
      return;
    }

    const tx = transaction;

    // Check if already processed
    if (tx.status !== "PENDING") {
      res.status(200).json({ message: "Transaction already processed", status: tx.status });
      return;
    }

    // Validate with SSLCOMMERZ
    const validation = await validateTransaction(sslcommerzTransactionId);

    if (!validation || validation.status !== "VALID" || validation.element[0].status !== "VALIDATED") {
      await updateStatus(tx.id, "FAILED");
      res.status(400).json({ errorMessage: "Transaction validation failed" });
      return;
    }

    const validationData = validation.element[0];

    // Verify amount
    if (parseFloat(validationData.amount) !== parseFloat(tx.amount)) {
      await updateStatus(tx.id, "FAILED");
      res.status(400).json({ errorMessage: "Amount mismatch" });
      return;
    }

    // Verify currency
    if (validationData.currency !== "BDT") {
      await updateStatus(tx.id, "FAILED");
      res.status(400).json({ errorMessage: "Currency mismatch" });
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
      await updateStatus(tx.id, "SUCCESS");
      await updateBankTransactionId(tx.id, validationData.bank_tran_id);

      await pool.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Money added successfully",
        amount: tx.amount,
      });
    } catch (err) {
      await pool.query("ROLLBACK");
      res.status(500).json({ errorMessage: "Failed to credit wallet" });
    }
  } catch (error) {
    console.error("Manual trigger success error:", error);
    res.status(500).json({ errorMessage: error.message || "Internal server error" });
  }
};

module.exports = { getBalance, freezeWallet, unfreezeWallet, blockWallet, unblockWallet, addMoney, handleSSLCOMMERZSuccess, handleSSLCOMMERZFail, handleSSLCOMMERZCancel, handleSSLCOMMERZIPN, manualProcessTransaction, manualTriggerSuccess };
