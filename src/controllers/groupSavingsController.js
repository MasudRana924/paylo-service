const { pool } = require("../config/db");
const { 
  createGroupSavings, 
  addMemberToGroup, 
  acceptGroupInvitation, 
  rejectGroupInvitation, 
  findById, 
  findByUserId, 
  getGroupMembers, 
  updateCurrentAmount, 
  updateStatus, 
  getPendingInvitations,
  getAcceptedMembersCount
} = require("../models/groupSavingsModel");
const { findByUserId: findWalletByUserId, updateBalance } = require("../models/walletModel");
const { findById: findUserById, findByPhone, getAllFcmTokens } = require("../models/userModel");
const { sendBulkNotification } = require("../helpers/notificationHelper");

// Create a new group savings
const createGroupSavingsHandler = async (req, res) => {
  try {
    const { name, goal_amount, duration, frequency, members } = req.body;
    const creator_id = req.user.userId;

    if (!name || !goal_amount || !duration || !frequency) {
      res.status(400).json({ errorMessage: "Name, goal amount, duration, and frequency are required" });
      return;
    }

    if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
      res.status(400).json({ errorMessage: "Frequency must be daily, weekly, or monthly" });
      return;
    }

    // Convert phone numbers to user_ids
    const processedMembers = [];
    if (members && members.length > 0) {
      for (const member of members) {
        if (!member.phone || !member.contribution_amount) {
          res.status(400).json({ errorMessage: "Each member must have phone and contribution_amount" });
          return;
        }

        const user = await findByPhone(member.phone);
        if (!user) {
          res.status(404).json({ errorMessage: `User with phone ${member.phone} not found` });
          return;
        }

        processedMembers.push({
          user_id: user.id,
          contribution_amount: member.contribution_amount
        });
      }
    }

    const groupData = {
      creator_id,
      name,
      goal_amount,
      duration,
      frequency,
      members: processedMembers
    };

    const groupSavings = await createGroupSavings(groupData);

    // Send notifications to all members
    if (processedMembers && processedMembers.length > 0) {
      const memberUserIds = processedMembers.map(m => m.user_id);
      const fcmTokens = [];
      
      for (const userId of memberUserIds) {
        const user = await findUserById(userId);
        if (user && user.fcm_token) {
          fcmTokens.push(user.fcm_token);
        }
      }

      if (fcmTokens.length > 0) {
        await sendBulkNotification(
          fcmTokens,
          "Group Savings Invitation",
          `You have been invited to join "${name}"`,
          {
            type: "group_savings_invitation",
            group_savings_id: groupSavings.id.toString(),
            action: "accept_invitation"
          }
        );
      }
    }

    res.status(201).json({
      successMessage: "Group savings created successfully",
      groupSavings,
    });
  } catch (error) {
    console.error("Create group savings error:", error);
    res.status(500).json({ errorMessage: "Error creating group savings" });
  }
};

// Accept group savings invitation
const acceptInvitation = async (req, res) => {
  try {
    const { group_savings_id } = req.body;
    const userId = req.user.userId;

    const groupSavings = await findById(group_savings_id);
    if (!groupSavings) {
      res.status(404).json({ errorMessage: "Group savings not found" });
      return;
    }

    if (groupSavings.status !== 'active') {
      res.status(400).json({ errorMessage: "Group savings is not active" });
      return;
    }

    const member = await acceptGroupInvitation(group_savings_id, userId);
    if (!member) {
      res.status(404).json({ errorMessage: "Invitation not found" });
      return;
    }

    // Check if user has sufficient balance
    const wallet = await findWalletByUserId(userId);
    if (!wallet) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
    }

    if (wallet.balance >= member.contribution_amount) {
      // Deduct immediately if balance is sufficient
      await pool.query("BEGIN");
      try {
        await updateBalance(userId, -member.contribution_amount);
        await updateCurrentAmount(group_savings_id, member.contribution_amount);
        await pool.query("COMMIT");

        // Send notification for successful deduction
        const user = await findUserById(userId);
        if (user && user.fcm_token) {
          await sendBulkNotification(
            [user.fcm_token],
            "Group Savings Contribution",
            `${member.contribution_amount} has been deducted from your wallet for "${groupSavings.name}"`,
            {
              type: "group_savings_deduction",
              group_savings_id: group_savings_id.toString(),
              amount: member.contribution_amount.toString()
            }
          );
        }

        res.status(200).json({
          successMessage: "Invitation accepted and contribution deducted successfully",
          member,
        });
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    } else {
      // Add to pending deductions if insufficient balance
      await pool.query(
        `INSERT INTO group_savings_pending_deductions (group_savings_id, user_id, amount, status) 
         VALUES ($1, $2, $3, 'pending') 
         ON CONFLICT (group_savings_id, user_id) DO UPDATE 
         SET amount = $3, status = 'pending'`,
        [group_savings_id, userId, member.contribution_amount]
      );

      res.status(200).json({
        successMessage: "Invitation accepted. Contribution will be deducted when you have sufficient balance.",
        member,
        pendingDeduction: true,
      });
    }
  } catch (error) {
    console.error("Accept invitation error:", error);
    res.status(500).json({ errorMessage: "Error accepting invitation" });
  }
};

// Reject group savings invitation
const rejectInvitation = async (req, res) => {
  try {
    const { group_savings_id } = req.body;
    const userId = req.user.userId;

    const member = await rejectGroupInvitation(group_savings_id, userId);
    if (!member) {
      res.status(404).json({ errorMessage: "Invitation not found" });
      return;
    }

    res.status(200).json({
      successMessage: "Invitation rejected successfully",
      member,
    });
  } catch (error) {
    console.error("Reject invitation error:", error);
    res.status(500).json({ errorMessage: "Error rejecting invitation" });
  }
};

// Get group savings by ID
const getGroupSavingsById = async (req, res) => {
  try {
    const { id } = req.params;
    const groupSavings = await findById(id);

    if (!groupSavings) {
      res.status(404).json({ errorMessage: "Group savings not found" });
      return;
    }

    const members = await getGroupMembers(id);

    // Calculate percentage paid, remaining installments, and next payment date
    const totalInstallments = groupSavings.duration;
    const percentagePaid = groupSavings.goal_amount > 0 
      ? ((groupSavings.current_amount / groupSavings.goal_amount) * 100).toFixed(2) 
      : 0;
    const remainingInstallments = totalInstallments - Math.floor((groupSavings.current_amount / groupSavings.goal_amount) * totalInstallments);
    
    // Calculate next payment date based on frequency
    let nextPaymentDate = null;
    if (groupSavings.status === 'active' && groupSavings.start_date) {
      const startDate = new Date(groupSavings.start_date);
      const now = new Date();
      let daysToAdd = 0;
      
      if (groupSavings.frequency === 'daily') {
        daysToAdd = 1;
      } else if (groupSavings.frequency === 'weekly') {
        daysToAdd = 7;
      } else if (groupSavings.frequency === 'monthly') {
        daysToAdd = 30;
      }
      
      // Calculate how many installments have been paid based on start date
      const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
      const installmentsPaid = Math.floor(daysSinceStart / daysToAdd);
      const nextPaymentDays = (installmentsPaid + 1) * daysToAdd;
      
      nextPaymentDate = new Date(startDate);
      nextPaymentDate.setDate(startDate.getDate() + nextPaymentDays);
      
      // If next payment date is in the past, calculate the next upcoming one
      if (nextPaymentDate <= now) {
        const additionalInstallments = Math.floor((now - nextPaymentDate) / (1000 * 60 * 60 * 24 * daysToAdd)) + 1;
        nextPaymentDate.setDate(nextPaymentDate.getDate() + (additionalInstallments * daysToAdd));
      }
    }

    const groupSavingsWithDetails = {
      ...groupSavings,
      percentage_paid: parseFloat(percentagePaid),
      remaining_installments: Math.max(0, remainingInstallments),
      total_installments: totalInstallments,
      next_payment_date: nextPaymentDate ? nextPaymentDate.toISOString() : null
    };

    res.status(200).json({
      successMessage: "Group savings retrieved successfully",
      groupSavings: groupSavingsWithDetails,
      members,
    });
  } catch (error) {
    console.error("Get group savings error:", error);
    res.status(500).json({ errorMessage: "Error retrieving group savings" });
  }
};

// Get all group savings for a user
const getUserGroupSavings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const groupSavings = await findByUserId(userId);

    // Calculate percentage paid, remaining installments, and next payment date for each
    const groupSavingsWithDetails = groupSavings.map(gs => {
      const totalInstallments = gs.duration;
      const percentagePaid = gs.goal_amount > 0 
        ? ((gs.current_amount / gs.goal_amount) * 100).toFixed(2) 
        : 0;
      const remainingInstallments = totalInstallments - Math.floor((gs.current_amount / gs.goal_amount) * totalInstallments);
      
      // Calculate next payment date based on frequency
      let nextPaymentDate = null;
      if (gs.status === 'active' && gs.start_date) {
        const startDate = new Date(gs.start_date);
        const now = new Date();
        let daysToAdd = 0;
        
        if (gs.frequency === 'daily') {
          daysToAdd = 1;
        } else if (gs.frequency === 'weekly') {
          daysToAdd = 7;
        } else if (gs.frequency === 'monthly') {
          daysToAdd = 30;
        }
        
        // Calculate how many installments have been paid based on start date
        const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
        const installmentsPaid = Math.floor(daysSinceStart / daysToAdd);
        const nextPaymentDays = (installmentsPaid + 1) * daysToAdd;
        
        nextPaymentDate = new Date(startDate);
        nextPaymentDate.setDate(startDate.getDate() + nextPaymentDays);
        
        // If next payment date is in the past, calculate the next upcoming one
        if (nextPaymentDate <= now) {
          const additionalInstallments = Math.floor((now - nextPaymentDate) / (1000 * 60 * 60 * 24 * daysToAdd)) + 1;
          nextPaymentDate.setDate(nextPaymentDate.getDate() + (additionalInstallments * daysToAdd));
        }
      }

      return {
        ...gs,
        percentage_paid: parseFloat(percentagePaid),
        remaining_installments: Math.max(0, remainingInstallments),
        total_installments: totalInstallments,
        next_payment_date: nextPaymentDate ? nextPaymentDate.toISOString() : null
      };
    });

    res.status(200).json({
      successMessage: "Group savings retrieved successfully",
      groupSavings: groupSavingsWithDetails,
    });
  } catch (error) {
    console.error("Get user group savings error:", error);
    res.status(500).json({ errorMessage: "Error retrieving group savings" });
  }
};

// Get pending invitations for a user
const getPendingInvitationsHandler = async (req, res) => {
  try {
    const userId = req.user.userId;
    const invitations = await getPendingInvitations(userId);

    res.status(200).json({
      successMessage: "Pending invitations retrieved successfully",
      invitations,
    });
  } catch (error) {
    console.error("Get pending invitations error:", error);
    res.status(500).json({ errorMessage: "Error retrieving pending invitations" });
  }
};

// Complete group savings and return money to all members
const completeGroupSavings = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const groupSavings = await findById(id);
    if (!groupSavings) {
      res.status(404).json({ errorMessage: "Group savings not found" });
      return;
    }

    if (groupSavings.creator_id !== userId) {
      res.status(403).json({ errorMessage: "Only creator can complete group savings" });
      return;
    }

    if (groupSavings.status !== 'active') {
      res.status(400).json({ errorMessage: "Group savings is not active" });
      return;
    }

    const members = await getGroupMembers(id);
    const acceptedMembers = members.filter(m => m.status === 'accepted');

    await pool.query("BEGIN");
    try {
      // Return money to all accepted members
      for (const member of acceptedMembers) {
        await updateBalance(member.user_id, member.contribution_amount);
      }

      // Update group savings status
      await updateStatus(id, 'completed');
      await pool.query("COMMIT");

      // Send notifications to all members
      const fcmTokens = [];
      for (const member of acceptedMembers) {
        const user = await findUserById(member.user_id);
        if (user && user.fcm_token) {
          fcmTokens.push(user.fcm_token);
        }
      }

      if (fcmTokens.length > 0) {
        await sendBulkNotification(
          fcmTokens,
          "Group Savings Completed",
          `Your group savings "${groupSavings.name}" has been completed. Money has been returned to your wallet.`,
          {
            type: "group_savings_completed",
            group_savings_id: id.toString(),
          }
        );
      }

      res.status(200).json({
        successMessage: "Group savings completed successfully",
        groupSavings,
        membersReturned: acceptedMembers.length,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Complete group savings error:", error);
    res.status(500).json({ errorMessage: "Error completing group savings" });
  }
};

// Cancel group savings
const cancelGroupSavings = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const groupSavings = await findById(id);
    if (!groupSavings) {
      res.status(404).json({ errorMessage: "Group savings not found" });
      return;
    }

    if (groupSavings.creator_id !== userId) {
      res.status(403).json({ errorMessage: "Only creator can cancel group savings" });
      return;
    }

    if (groupSavings.status !== 'active') {
      res.status(400).json({ errorMessage: "Group savings is not active" });
      return;
    }

    const members = await getGroupMembers(id);
    const acceptedMembers = members.filter(m => m.status === 'accepted');

    await pool.query("BEGIN");
    try {
      // Return money to all accepted members
      for (const member of acceptedMembers) {
        await updateBalance(member.user_id, member.contribution_amount);
      }

      // Update group savings status
      await updateStatus(id, 'cancelled');
      await pool.query("COMMIT");

      // Send notifications to all members
      const fcmTokens = [];
      for (const member of acceptedMembers) {
        const user = await findUserById(member.user_id);
        if (user && user.fcm_token) {
          fcmTokens.push(user.fcm_token);
        }
      }

      if (fcmTokens.length > 0) {
        await sendBulkNotification(
          fcmTokens,
          "Group Savings Cancelled",
          `Your group savings "${groupSavings.name}" has been cancelled. Money has been returned to your wallet.`,
          {
            type: "group_savings_cancelled",
            group_savings_id: id.toString(),
          }
        );
      }

      res.status(200).json({
        successMessage: "Group savings cancelled successfully",
        groupSavings,
        membersReturned: acceptedMembers.length,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Cancel group savings error:", error);
    res.status(500).json({ errorMessage: "Error cancelling group savings" });
  }
};

// Process pending deductions for a user
const processPendingDeductions = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get pending deductions for this user
    const pendingDeductions = await pool.query(
      `SELECT * FROM group_savings_pending_deductions 
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    if (pendingDeductions.rows.length === 0) {
      res.status(200).json({
        successMessage: "No pending deductions to process",
        processedCount: 0,
      });
      return;
    }

    const wallet = await findWalletByUserId(userId);
    if (!wallet) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
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

          // Send notification for successful deduction
          const groupSavings = await findById(deduction.group_savings_id);
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

    res.status(200).json({
      successMessage: `Processed ${processedCount} pending deductions`,
      processedCount,
      processedDeductions,
    });
  } catch (error) {
    console.error("Process pending deductions error:", error);
    res.status(500).json({ errorMessage: "Error processing pending deductions" });
  }
};

// Get pending deductions for a user
const getPendingDeductions = async (req, res) => {
  try {
    const userId = req.user.userId;

    const pendingDeductions = await pool.query(
      `SELECT gspd.*, gs.name as group_savings_name 
       FROM group_savings_pending_deductions gspd
       LEFT JOIN group_savings gs ON gspd.group_savings_id = gs.id
       WHERE gspd.user_id = $1 AND gspd.status = 'pending'
       ORDER BY gspd.created_at DESC`,
      [userId]
    );

    res.status(200).json({
      successMessage: "Pending deductions retrieved successfully",
      pendingDeductions: pendingDeductions.rows,
    });
  } catch (error) {
    console.error("Get pending deductions error:", error);
    res.status(500).json({ errorMessage: "Error retrieving pending deductions" });
  }
};

// Get payment schedule for a specific group savings
const getPaymentSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const groupSavings = await findById(id);

    if (!groupSavings) {
      res.status(404).json({ errorMessage: "Group savings not found" });
      return;
    }

    if (groupSavings.status !== 'active') {
      res.status(400).json({ errorMessage: "Group savings is not active" });
      return;
    }

    const startDate = new Date(groupSavings.start_date);
    const duration = groupSavings.duration;
    const frequency = groupSavings.frequency;
    
    let daysToAdd = 0;
    if (frequency === 'daily') {
      daysToAdd = 1;
    } else if (frequency === 'weekly') {
      daysToAdd = 7;
    } else if (frequency === 'monthly') {
      daysToAdd = 30;
    }

    const paymentSchedule = [];
    for (let i = 1; i <= duration; i++) {
      const paymentDate = new Date(startDate);
      paymentDate.setDate(startDate.getDate() + (i * daysToAdd));
      
      const now = new Date();
      const isPast = paymentDate < now;
      const isToday = paymentDate.toDateString() === now.toDateString();
      
      paymentSchedule.push({
        installment_number: i,
        payment_date: paymentDate.toISOString(),
        status: isPast ? 'paid' : (isToday ? 'due' : 'upcoming'),
        amount: groupSavings.goal_amount / duration
      });
    }

    res.status(200).json({
      successMessage: "Payment schedule retrieved successfully",
      group_savings_id: id,
      frequency,
      duration,
      start_date: groupSavings.start_date,
      payment_schedule: paymentSchedule,
    });
  } catch (error) {
    console.error("Get payment schedule error:", error);
    res.status(500).json({ errorMessage: "Error retrieving payment schedule" });
  }
};

module.exports = {
  createGroupSavingsHandler,
  acceptInvitation,
  rejectInvitation,
  getGroupSavingsById,
  getUserGroupSavings,
  getPendingInvitationsHandler,
  completeGroupSavings,
  cancelGroupSavings,
  processPendingDeductions,
  getPendingDeductions,
  getPaymentSchedule
};
