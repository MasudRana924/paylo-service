const { handleSignup, handleVerifyOTP, handleLogin, handleResendOTP, saveFcmToken, updateProfileImage } = require("../controllers/authController");
const { handleCheckReceiver, handleSendMoney, handleMerchantCheck, handleCheckAgent, handlePaymentLink, handleCashout, transactionHistory } = require("../controllers/transactionController");
const { getBalance, freezeWallet, unfreezeWallet, blockWallet, unblockWallet } = require("../controllers/walletController");
const { createNotification, getNotifications, getPublicNotifications, createAdmin, disableAdmin, listAdmins, toggleAdminWalletPermission } = require("../controllers/adminController");
const { authenticateToken } = require("../middleware/auth");
const { handleFileUpload } = require("../middleware/fileUpload");
const { requireRole, requireSuperAdmin, requireWalletStatusPermission } = require("../middleware/roleAuth");

const baseUrl = "/api/v1";

const routes = [
  {
    url: "/health",
    method: "GET",
    handler: (req, res) => {
      res.write("This is health");
      res.end();
    },
  },
  {
    url: "/auth/signup",
    method: "POST",
    handler: handleSignup,
  },
  {
    url: "/auth/verify-otp",
    method: "POST",
    handler: handleVerifyOTP,
  },
  {
    url: "/auth/login",
    method: "POST",
    handler: handleLogin,
  },
  {
    url: "/auth/resend-otp",
    method: "POST",
    handler: handleResendOTP,
  },
  {
    url: "/auth/save-fcm-token",
    method: "POST",
    middleware: authenticateToken,
    handler: saveFcmToken,
  },
  {
    url: "/auth/update-profile-image",
    method: "POST",
    middleware: [handleFileUpload, authenticateToken],
    handler: updateProfileImage,
  },
  {
    url: "/wallet/balance",
    method: "GET",
    middleware: authenticateToken,
    handler: getBalance,
  },
  {
    url: "/transaction/check-receiver",
    method: "POST",
    middleware: authenticateToken,
    handler: handleCheckReceiver,
  },
  {
    url: "/transaction/check-merchant",
    method: "POST",
    middleware: authenticateToken,
    handler: handleMerchantCheck,
  },
  {
    url: "/transaction/check-agent",
    method: "POST",
    middleware: authenticateToken,
    handler: handleCheckAgent,
  },
  {
    url: "/transaction/payment-link",
    method: "POST",
    middleware: authenticateToken,
    handler: handlePaymentLink,
  },
  {
    url: "/transaction/cashout",
    method: "POST",
    middleware: authenticateToken,
    handler: handleCashout,
  },
  {
    url: "/transaction/send-money",
    method: "POST",
    middleware: authenticateToken,
    handler: handleSendMoney,
  },
  {
    url: "/transaction/history",
    method: "GET",
    middleware: authenticateToken,
    handler: transactionHistory,
  },
  {
    url: "/wallet/freeze",
    method: "POST",
    middleware: [authenticateToken, requireWalletStatusPermission],
    handler: freezeWallet,
  },
  {
    url: "/wallet/unfreeze",
    method: "POST",
    middleware: [authenticateToken, requireWalletStatusPermission],
    handler: unfreezeWallet,
  },
  {
    url: "/wallet/block",
    method: "POST",
    middleware: [authenticateToken, requireWalletStatusPermission],
    handler: blockWallet,
  },
  {
    url: "/wallet/unblock",
    method: "POST",
    middleware: [authenticateToken, requireWalletStatusPermission],
    handler: unblockWallet,
  },
  {
    url: "/admin/notification/create",
    method: "POST",
    middleware: [handleFileUpload, authenticateToken, requireRole(["Admin", "SuperAdmin"])],
    handler: createNotification,
  },
  {
    url: "/admin/notification/list",
    method: "GET",
    middleware: [authenticateToken, requireRole(["Admin", "SuperAdmin"])],
    handler: getNotifications,
  },
  {
    url: "/public/notifications",
    method: "GET",
    handler: getPublicNotifications,
  },
  {
    url: "/admin/create",
    method: "POST",
    middleware: [authenticateToken, requireSuperAdmin],
    handler: createAdmin,
  },
  {
    url: "/admin/disable",
    method: "POST",
    middleware: [authenticateToken, requireSuperAdmin],
    handler: disableAdmin,
  },
  {
    url: "/admin/list",
    method: "GET",
    middleware: [authenticateToken, requireSuperAdmin],
    handler: listAdmins,
  },
  {
    url: "/admin/permission/wallet-status",
    method: "POST",
    middleware: [authenticateToken, requireSuperAdmin],
    handler: toggleAdminWalletPermission,
  },
];

module.exports = { routes, baseUrl };
