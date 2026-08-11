const express = require('express');
const router = express.Router();

const { handleSignup, handleVerifyOTP, handleLogin, handleResendOTP, saveFcmToken, updateProfileImage } = require("../controllers/authController");
const { handleCheckReceiver, handleSendMoney, handleMerchantCheck, handleCheckAgent, handlePaymentLink, handleCashout, transactionHistory } = require("../controllers/transactionController");
const { getBalance, freezeWallet, unfreezeWallet, blockWallet, unblockWallet, addMoney, handleSSLCOMMERZSuccess, handleSSLCOMMERZFail, handleSSLCOMMERZCancel, handleSSLCOMMERZIPN, manualProcessTransaction, manualTriggerSuccess } = require("../controllers/walletController");
const { createNotification, getNotifications, getPublicNotifications, createAdmin, disableAdmin, listAdmins, toggleAdminWalletPermission, getAdminALlUsers, getAdminALlUsersTransactions } = require("../controllers/adminController");
const { authenticateToken } = require("../middleware/auth");
const { handleFileUpload } = require("../middleware/fileUpload");
const { requireRole, requireSuperAdmin, requireWalletStatusPermission } = require("../middleware/roleAuth");

// Health check
router.get('/health', (req, res) => {
  res.send('This is health');
});

// Auth routes
router.post('/auth/signup', handleSignup);
router.post('/auth/verify-otp', handleVerifyOTP);
router.post('/auth/login', handleLogin);
router.post('/auth/resend-otp', handleResendOTP);
router.post('/auth/save-fcm-token', authenticateToken, saveFcmToken);
router.post('/auth/update-profile-image', handleFileUpload, authenticateToken, updateProfileImage);

// Wallet routes
router.get('/wallet/balance', authenticateToken, getBalance);
router.post('/wallet/freeze', authenticateToken, requireWalletStatusPermission, freezeWallet);
router.post('/wallet/unfreeze', authenticateToken, requireWalletStatusPermission, unfreezeWallet);
router.post('/wallet/block', authenticateToken, requireWalletStatusPermission, blockWallet);
router.post('/wallet/unblock', authenticateToken, requireWalletStatusPermission, unblockWallet);
router.post('/wallet/add-money', authenticateToken, addMoney);

// SSLCOMMERZ routes
router.post('/wallet/sslcommerz/success', handleSSLCOMMERZSuccess);
router.post('/wallet/sslcommerz/fail', handleSSLCOMMERZFail);
router.post('/wallet/sslcommerz/cancel', handleSSLCOMMERZCancel);
router.post('/wallet/sslcommerz/ipn', handleSSLCOMMERZIPN);

// Manual transaction processing
router.post('/wallet/process-transaction', authenticateToken, manualProcessTransaction);
router.post('/wallet/manual-success', authenticateToken, manualTriggerSuccess);

// Transaction routes
router.post('/transaction/check-receiver', authenticateToken, handleCheckReceiver);
router.post('/transaction/check-merchant', authenticateToken, handleMerchantCheck);
router.post('/transaction/check-agent', authenticateToken, handleCheckAgent);
router.post('/transaction/payment-link', authenticateToken, handlePaymentLink);
router.post('/transaction/cashout', authenticateToken, handleCashout);
router.post('/transaction/send-money', authenticateToken, handleSendMoney);
router.get('/transaction/history', authenticateToken, transactionHistory);

// Admin routes
router.post('/admin/notification/create', handleFileUpload, authenticateToken, requireRole(["Admin", "SuperAdmin"]), createNotification);
router.get('/admin/notification/list', authenticateToken, requireRole(["Admin", "SuperAdmin"]), getNotifications);
router.post('/admin/create', authenticateToken, requireSuperAdmin, createAdmin);
router.post('/admin/disable', authenticateToken, requireSuperAdmin, disableAdmin);
router.get('/admin/list', authenticateToken, requireSuperAdmin, listAdmins);
router.post('/admin/permission/wallet-status', authenticateToken, requireSuperAdmin, toggleAdminWalletPermission);
router.get('/admin/users', authenticateToken, requireSuperAdmin, getAdminALlUsers);
router.get('/admin/users/transactions', authenticateToken, requireSuperAdmin, getAdminALlUsersTransactions);

// Public routes
router.get('/public/notifications', getPublicNotifications);

module.exports = router;
