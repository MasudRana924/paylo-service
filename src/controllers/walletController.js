const { pool } = require("../config/db");

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

module.exports = { getBalance, freezeWallet, unfreezeWallet, blockWallet, unblockWallet };
