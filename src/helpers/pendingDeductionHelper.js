const { pool } = require("../config/db");
const { findByUserId: findWalletByUserId, updateBalance } = require("../models/walletModel");
const { findById: findGroupSavingsById, updateCurrentAmount } = require("../models/groupSavingsModel");
const { findById: findUserById } = require("../models/userModel");
const { sendBulkNotification } = require("./notificationHelper");

// Process pending deductions for a user automatically
const processPendingDeductionsForUser = async (userId) => {
  try {
    // Get pending deductions for this user
    const pendingDeductions = await pool.query(
      `SELECT * FROM group_savings_pending_deductions 
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    if (pendingDeductions.rows.length === 0) {
      return { processedCount: 0, processedDeductions: [] };
    }

    const wallet = await findWalletByUserId(userId);
    if (!wallet) {
      console.error(`Wallet not found for user ${userId}`);
      return { processedCount: 0, processedDeductions: [] };
    }

    let processedCount = 0;
    const processedDeductions = [];

    for (const deduction of pendingDeductions.rows) {
      if (wallet.balance >= deduction.amount) {
        await pool.query("BEGIN");
        try {
          await updateBalance(userId, -deduction.amount);
          await updateCurrentAmount(deduction.group_savings_id, deduction.amount);
          
          // Update deduction status
          await pool.query(
            `UPDATE group_savings_pending_deductions 
             SET status = 'completed', processed_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [deduction.id]
          );
          
          await pool.query("COMMIT");
          
          // Update wallet balance for next iteration
          wallet.balance -= deduction.amount;
          
          processedCount++;
          processedDeductions.push(deduction);

          console.log(`✅ Processed pending deduction ${deduction.id}: ${deduction.amount} for user ${userId}`);

          // Send notification for successful deduction
          const groupSavings = await findGroupSavingsById(deduction.group_savings_id);
          const user = await findUserById(userId);
          if (user && user.fcm_token && groupSavings) {
            await sendBulkNotification(
              [user.fcm_token],
              "Group Savings Contribution",
              `${deduction.amount} has been deducted from your wallet for "${groupSavings.name}"`,
              {
                type: "group_savings_deduction",
                group_savings_id: deduction.group_savings_id.toString(),
                amount: deduction.amount.toString()
              }
            );
          }
        } catch (error) {
          await pool.query("ROLLBACK");
          console.error(`Error processing deduction ${deduction.id}:`, error);
        }
      }
    }

    return { processedCount, processedDeductions };
  } catch (error) {
    console.error("Process pending deductions error:", error);
    return { processedCount: 0, processedDeductions: [] };
  }
};

module.exports = { processPendingDeductionsForUser };
