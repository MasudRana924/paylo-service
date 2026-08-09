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
    const appDeepLink = process.env.APP_DEEP_LINK || "app.tapcash";

    const sendRedirectResponse = (tranId, status = "success", title = "Payment Successful") => {
      const redirectUrl = `${appDeepLink}://payment/${status}?transactionId=${encodeURIComponent(tranId || "")}&status=${status}`;

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
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

    const redirectFailed = (tranId) => {
      sendRedirectResponse(tranId, "failed", "Payment Failed");
    };

    try {
      const params = new URLSearchParams(body);
      const tranId = params.get("tran_id") || params.get("tranId") || "";

      if (!tranId) {
        return redirectFailed("");
      }

      // 1. Find existing transaction
      const transaction = await pool.query(
        "SELECT * FROM transactions WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY'",
        [tranId]
      );

      if (transaction.rows.length === 0) {
        return redirectFailed(tranId);
      }

      const tx = transaction.rows[0];

      // If already processed as SUCCESS, redirect to success deep link (Idempotent response)
      if (tx.status === "SUCCESS") {
        return redirectSuccess(tranId);
      }

      const valId = params.get("val_id") || params.get("valId") || "";

      // 2. Validate with SSLCOMMERZ
      const validation = await validateTransaction(valId, tranId);

      const valData = validation && validation.element && validation.element[0]
        ? validation.element[0]
        : validation;

      const isValidStatus =
        validation?.status === "VALID" ||
        valData?.status === "VALIDATED" ||
        valData?.status === "VALID";

      if (!validation || !isValidStatus) {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        return redirectFailed(tranId);
      }

      // 3. Verify amount
      const valAmount = valData?.amount || validation?.amount;
      if (!valAmount || Math.abs(parseFloat(valAmount) - parseFloat(tx.amount)) > 0.01) {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        return redirectFailed(tranId);
      }

      // 4. Verify currency
      const valCurrency = valData?.currency || validation?.currency;
      if (valCurrency && valCurrency !== "BDT") {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED' WHERE id = $1",
          [tx.id]
        );
        return redirectFailed(tranId);
      }

      // 5. Atomically update transaction + wallet with duplicate protection
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const updateTx = await client.query(
          "UPDATE transactions SET status = 'SUCCESS', bank_transaction_id = $1 WHERE id = $2 AND status = 'PENDING' RETURNING *",
          [params.get("bank_tran_id") || valData?.bank_tran_id || null, tx.id]
        );

        if (updateTx.rows.length > 0) {
          await client.query(
            "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
            [tx.amount, tx.sender_id]
          );
        }

        await client.query("COMMIT");
        return redirectSuccess(tranId);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("SSLCOMMERZ wallet credit transaction error:", err);
        return redirectFailed(tranId);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("SSLCOMMERZ success callback error:", error);
      return redirectFailed("");
    }
  });
};

const handleSSLCOMMERZFail = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const appDeepLink = process.env.APP_DEEP_LINK || "app.tapcash";
    const params = new URLSearchParams(body);
    const tranId = params.get("tran_id") || params.get("tranId") || "";

    if (tranId) {
      await pool.query(
        "UPDATE transactions SET status = 'FAILED' WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY' AND status = 'PENDING'",
        [tranId]
      );
    }

    const redirectUrl = `${appDeepLink}://payment/failed?transactionId=${encodeURIComponent(tranId)}&status=failed`;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
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
  });
};

const handleSSLCOMMERZCancel = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const appDeepLink = process.env.APP_DEEP_LINK || "app.tapcash";
    const params = new URLSearchParams(body);
    const tranId = params.get("tran_id") || params.get("tranId") || "";

    if (tranId) {
      await pool.query(
        "UPDATE transactions SET status = 'CANCELLED' WHERE sslcommerz_transaction_id = $1 AND transaction_type = 'ADD_MONEY' AND status = 'PENDING'",
        [tranId]
      );
    }

    const redirectUrl = `${appDeepLink}://payment/cancel?transactionId=${encodeURIComponent(tranId)}&status=cancelled`;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
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
