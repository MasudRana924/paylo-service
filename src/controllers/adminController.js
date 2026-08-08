const { pool } = require("../config/db");
const { uploadImageToCloudinary, deleteImageFromCloudinary } = require("../helpers/imageUpload");
const { cleanupFile } = require("../middleware/fileUpload");
const { sendBulkNotification } = require("../helpers/notificationHelper");

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
      res.end(JSON.stringify({ errorMessage: "Title or description is required" }));
      return;
    }

    const result = await pool.query(
      "INSERT INTO notifications (title, description, image_url, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [title, description, imageUrl, req.user.userId]
    );

    // Get all FCM tokens from users table
    const fcmTokensResult = await pool.query(
      "SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND fcm_token != ''"
    );

    const fcmTokens = fcmTokensResult.rows.map(row => row.fcm_token);

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

    res.end(
      JSON.stringify({
        successMessage: "Notification created successfully and sent to all devices",
        notification: result.rows[0],
        devicesNotified: fcmTokens.length,
      })
    );
  } catch (error) {
    // Clean up file if error occurred
    if (req.files && req.files.notificationImage) {
      cleanupFile(req.files.notificationImage.filepath);
    }
    res.end(JSON.stringify({ errorMessage: error.message || "Error creating notification" }));
  }
};

const getNotifications = async (req, res) => {
  try {
    const notifications = await pool.query(
      `SELECT n.*, u.name as created_by_name, u.phone as created_by_phone
       FROM notifications n
       LEFT JOIN users u ON n.created_by = u.id
       ORDER BY n.created_at DESC`
    );

    res.end(
      JSON.stringify({
        successMessage: "Notifications retrieved successfully",
        notifications: notifications.rows,
      })
    );
  } catch (error) {
    res.end(JSON.stringify({ errorMessage: "Error retrieving notifications" }));
  }
};

const getPublicNotifications = async (req, res) => {
  try {
    const notifications = await pool.query(
      `SELECT id, title, description, image_url, created_at
       FROM notifications
       ORDER BY created_at DESC
       LIMIT 20`
    );

    res.end(
      JSON.stringify({
        successMessage: "Public notifications retrieved successfully",
        notifications: notifications.rows,
      })
    );
  } catch (error) {
    res.end(JSON.stringify({ errorMessage: "Error retrieving public notifications" }));
  }
};

const createAdmin = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);

      if (!data.phone || !data.pin) {
        res.end(JSON.stringify({ errorMessage: "Phone and PIN are required" }));
        return;
      }

      const existingUser = await pool.query(
        "SELECT * FROM users WHERE phone = $1",
        [data.phone]
      );

      if (existingUser.rows.length > 0) {
        res.end(JSON.stringify({ errorMessage: "User already exists" }));
        return;
      }

      const result = await pool.query(
        "INSERT INTO users (phone, pin, name, user_type) VALUES ($1, $2, $3, $4) RETURNING id, phone, name, user_type",
        [data.phone, data.pin, data.name || null, "Admin"]
      );

      await pool.query(
        "INSERT INTO wallets (user_id, balance) VALUES ($1, 0.00)",
        [result.rows[0].id]
      );

      res.end(
        JSON.stringify({
          successMessage: "Admin created successfully",
          admin: result.rows[0],
        })
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error creating admin" }));
    }
  });
};

const disableAdmin = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);

      const admin = await pool.query(
        "SELECT id, user_type FROM users WHERE phone = $1",
        [data.phone]
      );

      if (admin.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Admin not found" }));
        return;
      }

      if (admin.rows[0].user_type !== "Admin") {
        res.end(JSON.stringify({ errorMessage: "User is not an Admin" }));
        return;
      }

      await pool.query(
        "UPDATE users SET user_type = 'Personal' WHERE phone = $1",
        [data.phone]
      );

      res.end(
        JSON.stringify({
          successMessage: "Admin disabled successfully",
        })
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error disabling admin" }));
    }
  });
};

const listAdmins = async (req, res) => {
  try {
    const admins = await pool.query(
      "SELECT id, phone, name, user_type, created_at FROM users WHERE user_type = 'Admin' ORDER BY created_at DESC"
    );

    res.end(
      JSON.stringify({
        successMessage: "Admins retrieved successfully",
        admins: admins.rows,
      })
    );
  } catch (error) {
    res.end(JSON.stringify({ errorMessage: "Error retrieving admins" }));
  }
};

const toggleAdminWalletPermission = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);

      const currentPermission = await pool.query(
        "SELECT can_change_wallet_status FROM admin_permissions WHERE id = 1"
      );

      if (currentPermission.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "Permission record not found" }));
        return;
      }

      const newPermission = !currentPermission.rows[0].can_change_wallet_status;

      await pool.query(
        "UPDATE admin_permissions SET can_change_wallet_status = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
        [newPermission, req.user.userId]
      );

      res.end(
        JSON.stringify({
          successMessage: `Admin wallet status permission ${newPermission ? 'enabled' : 'disabled'} successfully`,
          can_change_wallet_status: newPermission,
        })
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error toggling admin permission" }));
    }
  });
};

module.exports = {
  createNotification,
  getNotifications,
  getPublicNotifications,
  createAdmin,
  disableAdmin,
  listAdmins,
  toggleAdminWalletPermission,
};
