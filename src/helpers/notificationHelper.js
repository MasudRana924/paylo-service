const messaging = require("../config/firebase");

const sendNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) {
    console.log("No FCM token provided, skipping notification");
    return;
  }

  // Convert all data values to strings and handle null/undefined
  const stringData = {};
  for (const [key, value] of Object.entries(data)) {
    stringData[key] = value !== null && value !== undefined ? String(value) : "";
  }

  const message = {
    token: fcmToken,
    notification: {
      title: title,
      body: body,
    },
    data: stringData,
    android: {
      priority: "high",
    },
  };

  try {
    const response = await messaging.send(message);
    console.log("Notification sent successfully:", response);
    return response;
  } catch (error) {
    if (error.errorInfo?.code === "messaging/mismatched-credential") {
      console.error(
        "FCM Token SenderId mismatch: The FCM token was created by a different Firebase project than the service account key (paylo-560c4)."
      );
    } else if (error.errorInfo?.code === "messaging/registration-token-not-registered") {
      console.error("FCM Token expired or invalid: The token is no longer registered.");
    } else {
      console.error("Error sending notification:", error);
    }
    throw error;
  }
};

const sendMoneyReceivedNotification = async (receiverFcmToken, senderName, amount) => {
  return await sendNotification(
    receiverFcmToken,
    "Money Received",
    `You received ${amount} from ${senderName}`,
    {
      type: "money_received",
      amount: amount.toString(),
      sender_name: senderName,
    }
  );
};

const sendMoneySentNotification = async (senderFcmToken, receiverName, amount) => {
  return await sendNotification(
    senderFcmToken,
    "Send Money",
    // `You sent ${amount} to ${receiverName}`,
    // {
    //   type: "money_sent",
    //   amount: amount.toString(),
    //   receiver_name: receiverName,
    // }
  );
};

const sendBulkNotification = async (fcmTokens, title, body, data = {}) => {
  if (!fcmTokens || fcmTokens.length === 0) {
    console.log("No FCM tokens provided, skipping bulk notification");
    return;
  }

  // Convert all data values to strings and handle null/undefined
  const stringData = {};
  for (const [key, value] of Object.entries(data)) {
    stringData[key] = value !== null && value !== undefined ? String(value) : "";
  }

  const results = [];
  const errors = [];

  for (const fcmToken of fcmTokens) {
    try {
      const message = {
        token: fcmToken,
        notification: {
          title: title,
          body: body,
        },
        data: stringData,
        android: {
          priority: "high",
        },
      };

      const response = await messaging.send(message);
      console.log(`Notification sent successfully to token ${fcmToken.substring(0, 10)}...:`, response);
      results.push({ token: fcmToken, success: true, response });
    } catch (error) {
      if (error.errorInfo?.code === "messaging/mismatched-credential") {
        console.error(
          `FCM Token SenderId mismatch for token ${fcmToken.substring(0, 10)}...: The FCM token was created by a different Firebase project than the service account key (paylo-560c4).`
        );
      } else if (error.errorInfo?.code === "messaging/registration-token-not-registered") {
        console.error(`FCM Token expired or invalid for token ${fcmToken.substring(0, 10)}...: The token is no longer registered.`);
      } else {
        console.error(`Error sending notification to token ${fcmToken.substring(0, 10)}...:`, error);
      }
      errors.push({ token: fcmToken, success: false, error: error.message });
    }
  }

  return { results, errors, totalSent: results.length, totalErrors: errors.length };
};

module.exports = {
  sendNotification,
  sendMoneyReceivedNotification,
  sendMoneySentNotification,
  sendBulkNotification,
};
