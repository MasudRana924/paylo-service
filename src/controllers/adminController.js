const { pool } = require("../config/db");
const { uploadImageToCloudinary, deleteImageFromCloudinary } = require("../helpers/imageUpload");
const { cleanupFile } = require("../middleware/fileUpload");
const { sendBulkNotification } = require("../helpers/notificationHelper");
const { saveNotification, getAll, getPublic } = require("../models/notificationModel");
const { findByPhone, saveUser, updateUserType, getAllFcmTokens } = require("../models/userModel");
const { saveWallet } = require("../models/walletModel");
const { getExistingAllUsers, getExistingAllUsersTransactions } = require("../models/adminModel");

const createNotification = async (req, res) => {
  try {
    // Check if file was uploaded
    let imageUrl = null;
    if (req.files && req.files.notificationImage) {
      const uploadedFile = req.files.notificationImage;

      // Upload new image
      const uploadResult = await uploadImageToCloudinary(uploadedFile.filepath);
      imageUrl = uploadResult.url;

      // Clean up temporary file
      cleanupFile(uploadedFile.filepath);
    }

    // Get title and description from fields (both optional)
    const title = req.fields.title || null;
    const description = req.fields.description || null;

    // At least title or description should be provided
    if (!title && !description) {
      res.status(400).json({ errorMessage: "Title or description is required" });
      return;
    }

    const result = await saveNotification({ title, description, imageUrl, created_by: req.user.userId });

    // Get all FCM tokens from users table
    const fcmTokens = await getAllFcmTokens();

    // Send push notifications to all devices with FCM tokens
    if (fcmTokens.length > 0) {
      const notificationTitle = title || "New Notification";
      const notificationBody = description || "You have a new notification";
      
      await sendBulkNotification(
        fcmTokens,
        notificationTitle,
        notificationBody,
        {
          type: "admin_notification",
          notification_id: result.rows[0].id.toString(),
        }
      );
    }

    res.status(201).json({
      successMessage: "Notification created successfully and sent to all devices",
      notification: result.rows[0],
      devicesNotified: fcmTokens.length,
    });
  } catch (error) {
    // Clean up file if error occurred
    if (req.files && req.files.notificationImage) {
      cleanupFile(req.files.notificationImage.filepath);
    }
    res.status(500).json({ errorMessage: error.message || "Error creating notification" });
  }
};

const getNotifications = async (req, res) => {
  try {
    const notifications = await getAll();

    res.status(200).json({
      successMessage: "Notifications retrieved successfully",
      notifications: notifications,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error retrieving notifications" });
  }
};

const getPublicNotifications = async (req, res) => {
  try {
    const notifications = await getPublic();

    res.status(200).json({
      successMessage: "Public notifications retrieved successfully",
      notifications: notifications,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error retrieving public notifications" });
  }
};

const createAdmin = async (req, res) => {
  try {
    const data = req.body;

    if (!data.phone || !data.pin) {
      res.status(400).json({ errorMessage: "Phone and PIN are required" });
      return;
    }

    const existingUser = await findByPhone(data.phone);

    if (existingUser) {
      res.status(400).json({ errorMessage: "User already exists" });
      return;
    }

    const user = await saveUser({ phone, pin, name, user_type: "Admin" });
    await saveWallet(user.id);

    res.status(201).json({
      successMessage: "Admin created successfully",
      admin: user,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error creating admin" });
  }
};

const disableAdmin = async (req, res) => {
  try {
    const data = req.body;

    const admin = await findByPhone(data.phone);

    if (!admin) {
      res.status(404).json({ errorMessage: "Admin not found" });
      return;
    }

    if (admin.user_type !== "Admin") {
      res.status(400).json({ errorMessage: "User is not an Admin" });
      return;
    }

    await updateUserType(data.phone, "Personal");

    res.status(200).json({
      successMessage: "Admin disabled successfully",
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error disabling admin" });
  }
};

const listAdmins = async (req, res) => {
  try {
    const admins = await pool.query(
      "SELECT id, phone, name, user_type, created_at FROM users WHERE user_type = 'Admin' ORDER BY created_at DESC"
    );

    res.status(200).json({
      successMessage: "Admins retrieved successfully",
      admins: admins.rows,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error retrieving admins" });
  }
};

const toggleAdminWalletPermission = async (req, res) => {
  try {
    const data = req.body;

    const currentPermission = await pool.query(
      "SELECT can_change_wallet_status FROM admin_permissions WHERE id = 1"
    );

    if (currentPermission.rows.length === 0) {
      res.status(404).json({ errorMessage: "Permission record not found" });
      return;
    }

    const newPermission = !currentPermission.rows[0].can_change_wallet_status;

    await pool.query(
      "UPDATE admin_permissions SET can_change_wallet_status = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      [newPermission, req.user.userId]
    );

    res.status(200).json({
      successMessage: `Admin wallet status permission ${newPermission ? 'enabled' : 'disabled'} successfully`,
      can_change_wallet_status: newPermission,
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error toggling admin permission" });
  }
};

const getAdminALlUsers=async(req,res)=>{
  try{
    const users=await getExistingAllUsers()
    res.status(200).json({
      successMessage: "All users retrieved successfully",
      users: users,
    })

  }catch(error){

    res.status(500).json({errorMessage:error.message})
  }
}
const getAdminALlUsersTransactions=async(req,res)=>{
  try{
    const transactions=await getExistingAllUsersTransactions()
    res.status(200).json({
      successMessage: "All users transactions retrieved successfully",
      transactions: transactions,
    })

  }catch(error){

    res.status(500).json({errorMessage:error.message})
  }
}
module.exports = {
  createNotification,
  getNotifications,
  getPublicNotifications,
  createAdmin,
  disableAdmin,
  listAdmins,
  toggleAdminWalletPermission,
  getAdminALlUsers,
  getAdminALlUsersTransactions
};
