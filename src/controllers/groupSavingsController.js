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

    // Deduct balance from user's wallet
    const wallet = await findWalletByUserId(userId);
    if (!wallet) {
      res.status(404).json({ errorMessage: "Wallet not found" });
      return;
    }

    if (wallet.balance < member.contribution_amount) {
      res.status(400).json({ errorMessage: "Insufficient balance" });
      return;
    }

    await pool.query("BEGIN");
    try {
      await updateBalance(userId, -member.contribution_amount);
      await updateCurrentAmount(group_savings_id, member.contribution_amount);
      await pool.query("COMMIT");

      res.status(200).json({
        successMessage: "Invitation accepted and contribution deducted successfully",
        member,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
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

    res.status(200).json({
      successMessage: "Group savings retrieved successfully",
      groupSavings,
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

    res.status(200).json({
      successMessage: "Group savings retrieved successfully",
      groupSavings,
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

module.exports = {
  createGroupSavingsHandler,
  acceptInvitation,
  rejectInvitation,
  getGroupSavingsById,
  getUserGroupSavings,
  getPendingInvitationsHandler,
  completeGroupSavings,
  cancelGroupSavings
};
