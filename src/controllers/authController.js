const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { uploadImageToCloudinary, deleteImageFromCloudinary } = require("../helpers/imageUpload");
const { cleanupFile } = require("../middleware/fileUpload");
const { redis } = require("../config/redis");

const JWT_SECRET = "masud924";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "porao404@gmail.com",
    pass: "hbpuevhllmqfiqrd",
  },
});

const sendOTP = async (phone) => {
  const otp = "1234";
  await pool.query(
    "UPDATE users SET otp = $1, last_otp_sent_at = CURRENT_TIMESTAMP WHERE phone = $2",
    [otp, phone]
  );

  // Email sending disabled for now - using fixed OTP 1234
  // await transporter.sendMail({
  //   from: "porao404@gmail.com",
  //   to: "porao404@gmail.com",
  //   subject: "OTP for " + phone,
  //   text: `OTP for phone ${phone} is: ${otp}`,
  // });
};

const handleSignup = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const data = JSON.parse(body);
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [data.phone],
    );
    if (existingUser.rows.length > 0) {
      res.end(JSON.stringify({ errorMessage: "User already exists" }));
      return;
    }

    const result = await pool.query(
      "INSERT INTO users (phone, pin) VALUES ($1, $2) RETURNING id",
      [data.phone, data.pin],
    );

    const userId = result.rows[0].id;

    await pool.query(
      "INSERT INTO wallets (user_id, balance) VALUES ($1, 50.00)",
      [userId],
    );

    await sendOTP(data.phone);
    res.end(JSON.stringify({ successMessage: "User created successfully" }));
  });
};

const handleVerifyOTP = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const data = JSON.parse(body);
    const user = await pool.query("SELECT id, phone, pin, name, profile_image, user_type, otp, isverified, last_otp_sent_at, fcm_token FROM users WHERE phone = $1", [
      data.phone,
    ]);

    if (user.rows.length === 0 || user.rows[0].otp !== data.otp) {
      res.end(JSON.stringify({ errorMessage: "Invalid OTP" }));
      return;
    }

    await pool.query(
      "UPDATE users SET isVerified = TRUE, otp = NULL WHERE phone = $1",
      [data.phone],
    );

    const token = jwt.sign(
      { userId: user.rows[0].id, phone: user.rows[0].phone },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const wallet = await pool.query(
      "SELECT * FROM wallets WHERE user_id = $1",
      [user.rows[0].id]
    );

    // Cache user data in Redis with random TTL
    const userData = user.rows[0];
    const userRandomTTL = 3600 + Math.floor(Math.random() * 15);
    const walletRandomTTL = 300 + Math.floor(Math.random() * 15);
    await redis.setEx(`user:${userData.id}`, userRandomTTL, JSON.stringify(userData));
    await redis.setEx(`wallet:${userData.id}`, walletRandomTTL, JSON.stringify(wallet.rows[0]));
    console.log(`User data cached with TTL: ${userRandomTTL}s, Wallet data cached with TTL: ${walletRandomTTL}s`);

    res.end(
      JSON.stringify({
        successMessage: "Account verified successfully",
        token,
        user: userData,
        wallet: wallet.rows[0],
      }),
    );
  });
};

const handleLogin = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const data = JSON.parse(body);
    const user = await pool.query(
      "SELECT id, phone, pin, name, profile_image, user_type, otp, isverified, last_otp_sent_at, fcm_token FROM users WHERE phone = $1 AND pin = $2",
      [data.phone, data.pin],
    );

    if (user.rows.length === 0) {
      res.end(JSON.stringify({ errorMessage: "Invalid credentials" }));
      return;
    }

    if (!user.rows[0].isverified) {
      res.end(JSON.stringify({ errorMessage: "Account not verified" }));
      return;
    }

    const token = jwt.sign(
      { userId: user.rows[0].id, phone: user.rows[0].phone },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const wallet = await pool.query(
      "SELECT * FROM wallets WHERE user_id = $1",
      [user.rows[0].id]
    );

    // Cache user data in Redis with random TTL
    const userData = user.rows[0];
    const userRandomTTL = 3600 + Math.floor(Math.random() * 15);
    const walletRandomTTL = 300 + Math.floor(Math.random() * 15);
    await redis.setEx(`user:${userData.id}`, userRandomTTL, JSON.stringify(userData));
    await redis.setEx(`wallet:${userData.id}`, walletRandomTTL, JSON.stringify(wallet.rows[0]));
    console.log(`User data cached with TTL: ${userRandomTTL}s, Wallet data cached with TTL: ${walletRandomTTL}s`);

    res.end(
      JSON.stringify({
        successMessage: "Login successful",
        token,
        user: userData,
        wallet: wallet.rows[0],
      }),
    );
  });
};

const handleResendOTP = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const data = JSON.parse(body);
    
    const user = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [data.phone]
    );

    if (user.rows.length === 0) {
      res.end(JSON.stringify({ errorMessage: "User not found" }));
      return;
    }

    if (user.rows[0].isverified) {
      res.end(JSON.stringify({ errorMessage: "Account already verified" }));
      return;
    }

    // Check if last OTP was sent within 30 seconds
    if (user.rows[0].last_otp_sent_at) {
      const lastSent = new Date(user.rows[0].last_otp_sent_at);
      const now = new Date();
      const diffSeconds = (now - lastSent) / 1000;
      
      if (diffSeconds < 30) {
        const remainingTime = Math.ceil(30 - diffSeconds);
        res.end(
          JSON.stringify({
            errorMessage: `Please wait ${remainingTime} seconds before resending OTP`,
            remainingTime,
          })
        );
        return;
      }
    }

    await sendOTP(data.phone);
    res.end(
      JSON.stringify({
        successMessage: "OTP resent successfully",
        message: "Please wait 30 seconds before requesting another OTP",
        remainingTime: 30,
      })
    );
  });
};

const saveFcmToken = async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const data = JSON.parse(body);

    try {
      const result = await pool.query(
        "UPDATE users SET fcm_token = $1 WHERE id = $2 RETURNING *",
        [data.fcmToken, req.user.userId]
      );

      if (result.rows.length === 0) {
        res.end(JSON.stringify({ errorMessage: "User not found" }));
        return;
      }

      res.end(
        JSON.stringify({
          successMessage: "FCM token saved successfully",
        })
      );
    } catch (error) {
      res.end(JSON.stringify({ errorMessage: "Error saving FCM token" }));
    }
  });
};

const updateProfileImage = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.files || !req.files.profileImage) {
      res.end(JSON.stringify({ errorMessage: "No image provided" }));
      return;
    }

    const uploadedFile = req.files.profileImage;

    // Get current user to check for existing profile image
    const currentUser = await pool.query(
      "SELECT profile_image FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (currentUser.rows.length === 0) {
      res.end(JSON.stringify({ errorMessage: "User not found" }));
      cleanupFile(uploadedFile.filepath);
      return;
    }

    // Delete old image if exists
    if (currentUser.rows[0].profile_image) {
      try {
        // Extract public ID from Cloudinary URL
        // Cloudinary URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.jpg
        const urlParts = currentUser.rows[0].profile_image.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const publicId = fileName.split('.')[0];
        await deleteImageFromCloudinary(`profile_images/${publicId}`);
      } catch (error) {
        console.error("Error deleting old image:", error);
        // Continue with upload even if delete fails
      }
    }

    // Upload new image
    const uploadResult = await uploadImageToCloudinary(uploadedFile.filepath);

    // Clean up temporary file
    cleanupFile(uploadedFile.filepath);

    // Update user with new image URL
    const result = await pool.query(
      "UPDATE users SET profile_image = $1 WHERE id = $2 RETURNING *",
      [uploadResult.url, req.user.userId]
    );

    res.end(
      JSON.stringify({
        successMessage: "Profile image updated successfully",
        profileImage: result.rows[0].profile_image,
      })
    );
  } catch (error) {
    // Clean up file if error occurred
    if (req.files && req.files.profileImage) {
      cleanupFile(req.files.profileImage.filepath);
    }
    res.end(JSON.stringify({ errorMessage: error.message || "Error updating profile image" }));
  }
};

module.exports = { handleSignup, handleVerifyOTP, handleLogin, handleResendOTP, saveFcmToken, updateProfileImage };
