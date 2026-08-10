const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const { findByPhone, findById, saveUser, updateOTP, verifyUser, updateFcmToken, updateProfileImage: updateUserProfileImage } = require("../models/userModel");
const { findByUserId, saveWallet } = require("../models/walletModel");
const { uploadImageToCloudinary, deleteImageFromCloudinary } = require("../helpers/imageUpload");
const { cleanupFile } = require("../middleware/fileUpload");

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
  await updateOTP(phone, otp);

  // Email sending disabled for now - using fixed OTP 1234
  // await transporter.sendMail({
  //   from: "porao404@gmail.com",
  //   to: "porao404@gmail.com",
};

const handleSignup = async (req, res) => {
  const data = req.body;
  const phone = data.phone;
  const pin = data.pin;
  const name = data.name;
  const user_type = data.user_type;
  const fcm_token = data.fcm_token;

  if (!phone || !pin) {
    res.status(400).json({ errorMessage: "Phone and PIN are required" });
    return;
  }

  try {
    const existingUser = await findByPhone(phone);

    if (existingUser) {
      res.status(400).json({ errorMessage: "User already exists" });
      return;
    }

    const user = await saveUser({ phone, pin, name, user_type, fcm_token });
    await saveWallet(user.id);

    await sendOTP(phone);

    res.status(201).json({
      successMessage: "Account created successfully. OTP sent to email.",
      user: user,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ errorMessage: "Error creating account" });
  }
};

const handleVerifyOTP = async (req, res) => {
  const data = req.body;
  const user = await findByPhone(data.phone);

  if (!user || user.otp !== data.otp) {
    res.status(400).json({ errorMessage: "Invalid OTP" });
    return;
  }

  await verifyUser(data.phone);

  const token = jwt.sign(
    { userId: user.id, phone: user.phone },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const wallet = await findByUserId(user.id);

  res.status(200).json({
    successMessage: "Account verified successfully",
    token,
    user: user,
    wallet: wallet,
  });
};

const handleLogin = async (req, res) => {
  const data = req.body;
  const user = await findByPhone(data.phone);

  if (!user || user.pin !== data.pin) {
    res.status(401).json({ errorMessage: "Invalid credentials" });
    return;
  }

  if (!user.isverified) {
    res.status(400).json({ errorMessage: "Account not verified" });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, phone: user.phone },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const wallet = await findByUserId(user.id);

  res.status(200).json({
    successMessage: "Login successful",
    token,
    user: user,
    wallet: wallet,
  });
};

const handleResendOTP = async (req, res) => {
  const data = req.body;
  
  const user = await findByPhone(data.phone);

  if (!user) {
    res.status(404).json({ errorMessage: "User not found" });
    return;
  }

  if (user.isverified) {
    res.status(400).json({ errorMessage: "Account already verified" });
    return;
  }

  // Check if last OTP was sent within 30 seconds
  if (user.last_otp_sent_at) {
    const lastSent = new Date(user.last_otp_sent_at);
    const now = new Date();
    const diffSeconds = (now - lastSent) / 1000;
    
    if (diffSeconds < 30) {
      const remainingTime = Math.ceil(30 - diffSeconds);
      res.status(429).json({
        errorMessage: `Please wait ${remainingTime} seconds before resending OTP`,
        remainingTime,
      });
      return;
    }
  }

  await sendOTP(data.phone);
  res.status(200).json({
    successMessage: "OTP resent successfully",
    message: "Please wait 30 seconds before requesting another OTP",
    remainingTime: 30,
  });
};

const saveFcmToken = async (req, res) => {
  const data = req.body;

  try {
    const user = await updateFcmToken(req.user.userId, data.fcmToken);

    if (!user) {
      res.status(404).json({ errorMessage: "User not found" });
      return;
    }

    res.status(200).json({
      successMessage: "FCM token saved successfully",
    });
  } catch (error) {
    res.status(500).json({ errorMessage: "Error saving FCM token" });
  }
};

const updateProfileImage = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.files || !req.files.profileImage) {
      res.status(400).json({ errorMessage: "No image provided" });
      return;
    }

    const uploadedFile = req.files.profileImage;

    // Get current user to check for existing profile image
    const currentUser = await findById(req.user.userId);

    if (!currentUser) {
      res.status(404).json({ errorMessage: "User not found" });
      cleanupFile(uploadedFile.filepath);
      return;
    }

    // Delete old image if exists
    if (currentUser.profile_image) {
      try {
        // Extract public ID from Cloudinary URL
        // Cloudinary URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.jpg
        const urlParts = currentUser.profile_image.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const publicId = fileName.split('.')[0];
        await deleteImageFromCloudinary(`profile_images/${publicId}`);
      } catch (error) {
        console.error("Error deleting old image:", error);
      }
    }

    // Upload new image
    const uploadResult = await uploadImageToCloudinary(uploadedFile.filepath);

    // Clean up temporary file
    cleanupFile(uploadedFile.filepath);

    // Update user with new image URL
    const user = await updateUserProfileImage(req.user.userId, uploadResult.url);

    res.status(200).json({
      successMessage: "Profile image updated successfully",
      profileImage: uploadResult.url,
    });
  } catch (error) {
    console.error("Update profile image error:", error);
    res.status(500).json({ errorMessage: "Error updating profile image" });
  }
};

module.exports = { handleSignup, handleVerifyOTP, handleLogin, handleResendOTP, saveFcmToken, updateProfileImage };
