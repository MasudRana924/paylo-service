const { pool } = require("../config/db");

// Create a new group savings
const createGroupSavings = async (groupData) => {
  const { creator_id, name, goal_amount, duration, frequency, members } = groupData;
  
  // Calculate end date based on duration (in days)
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + duration);
  
  const result = await pool.query(
    `INSERT INTO group_savings (creator_id, name, goal_amount, duration, frequency, start_date, end_date) 
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [creator_id, name, goal_amount, duration, frequency, startDate, endDate]
  );
  
  const groupSavings = result.rows[0];
  
  // Add members to the group
  if (members && members.length > 0) {
    for (const member of members) {
      await addMemberToGroup(groupSavings.id, member.user_id, member.contribution_amount);
    }
  }
  
  return groupSavings;
};

// Add a member to group savings
const addMemberToGroup = async (groupSavingsId, userId, contributionAmount) => {
  const result = await pool.query(
    `INSERT INTO group_savings_members (group_savings_id, user_id, contribution_amount, status, joined_at) 
     VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP) 
     ON CONFLICT (group_savings_id, user_id) DO NOTHING 
     RETURNING *`,
    [groupSavingsId, userId, contributionAmount]
  );
  return result.rows[0];
};

// Accept group savings invitation
const acceptGroupInvitation = async (groupSavingsId, userId) => {
  const result = await pool.query(
    `UPDATE group_savings_members 
     SET status = 'accepted', joined_at = CURRENT_TIMESTAMP 
     WHERE group_savings_id = $1 AND user_id = $2 
     RETURNING *`,
    [groupSavingsId, userId]
  );
  return result.rows[0];
};

// Reject group savings invitation
const rejectGroupInvitation = async (groupSavingsId, userId) => {
  const result = await pool.query(
    `UPDATE group_savings_members 
     SET status = 'rejected' 
     WHERE group_savings_id = $1 AND user_id = $2 
     RETURNING *`,
    [groupSavingsId, userId]
  );
  return result.rows[0];
};

// Get group savings by ID
const findById = async (id) => {
  const result = await pool.query(
    `SELECT gs.*, 
      u.name as creator_name, u.phone as creator_phone
     FROM group_savings gs
     LEFT JOIN users u ON gs.creator_id = u.id
     WHERE gs.id = $1`,
    [id]
  );
  return result.rows[0];
};

// Get all group savings for a user (created or joined)
const findByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT DISTINCT gs.*, 
      u.name as creator_name, u.phone as creator_phone,
      gsm.status as member_status,
      gsm.contribution_amount as user_contribution
     FROM group_savings gs
     LEFT JOIN users u ON gs.creator_id = u.id
     LEFT JOIN group_savings_members gsm ON gs.id = gsm.group_savings_id AND gsm.user_id = $1
     WHERE gs.creator_id = $1 OR gsm.user_id = $1
     ORDER BY gs.created_at DESC`,
    [userId]
  );
  return result.rows;
};

// Get members of a group savings
const getGroupMembers = async (groupSavingsId) => {
  const result = await pool.query(
    `SELECT gsm.*, u.name, u.phone, u.profile_image
     FROM group_savings_members gsm
     LEFT JOIN users u ON gsm.user_id = u.id
     WHERE gsm.group_savings_id = $1
     ORDER BY gsm.created_at ASC`,
    [groupSavingsId]
  );
  return result.rows;
};

// Update group savings current amount
const updateCurrentAmount = async (id, amount) => {
  const result = await pool.query(
    `UPDATE group_savings 
     SET current_amount = current_amount + $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [amount, id]
  );
  return result.rows[0];
};

// Update group savings status
const updateStatus = async (id, status) => {
  const result = await pool.query(
    `UPDATE group_savings 
     SET status = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [status, id]
  );
  return result.rows[0];
};

// Get pending invitations for a user
const getPendingInvitations = async (userId) => {
  const result = await pool.query(
    `SELECT gs.*, gsm.contribution_amount
     FROM group_savings gs
     INNER JOIN group_savings_members gsm ON gs.id = gsm.group_savings_id
     WHERE gsm.user_id = $1 AND gsm.status = 'pending'
     ORDER BY gs.created_at DESC`,
    [userId]
  );
  return result.rows;
};

// Get accepted members count
const getAcceptedMembersCount = async (groupSavingsId) => {
  const result = await pool.query(
    `SELECT COUNT(*) as count 
     FROM group_savings_members 
     WHERE group_savings_id = $1 AND status = 'accepted'`,
    [groupSavingsId]
  );
  return parseInt(result.rows[0].count);
};

module.exports = {
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
};
