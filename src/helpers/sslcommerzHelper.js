const https = require('https');

const SSLCOMMERZ_STORE_ID = process.env.SSLCOMMERZ_STORE_ID;
const SSLCOMMERZ_STORE_PASSWORD = process.env.SSLCOMMERZ_STORE_PASSWORD;
const SSLCOMMERZ_IS_SANDBOX = process.env.SSLCOMMERZ_IS_SANDBOX === 'true';
const BACKEND_URL = process.env.BACKEND_URL;

const SSLCOMMERZ_API_URL = SSLCOMMERZ_IS_SANDBOX
  ? 'https://sandbox.sslcommerz.com'
  : 'https://securepay.sslcommerz.com';

/**
 * Create SSLCOMMERZ payment session
 */
const createPaymentSession = async (transactionId, amount, userId, userEmail, userName, userPhone) => {
  const postData = new URLSearchParams({
    store_id: SSLCOMMERZ_STORE_ID,
    store_passwd: SSLCOMMERZ_STORE_PASSWORD,
    total_amount: amount,
    currency: 'BDT',
    tran_id: transactionId,
    // Callback URLs disabled for learning project
    success_url: `${BACKEND_URL}/tapcash://payment-success`,
    fail_url: 'tapcash://payment-success',
    cancel_url: 'tapcash://payment-success',
    ipn_url: `${BACKEND_URL}/api/v1/wallet/sslcommerz/ipn`,
    product_name: 'Wallet Add Money',
    product_category: 'Wallet',
    product_profile: 'general',
    cus_name: userName || 'User',
    cus_email: userEmail || 'user@example.com',
    cus_phone: userPhone || '',
    cus_add1: 'Dhaka',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    shipping_method: 'NO',
    multi_card_name: 'visa,mastercard',
    card_type: 'visa,mastercard',
    value_a: userId.toString(),
    value_b: 'ADD_MONEY',
  }).toString();

  const options = {
    hostname: SSLCOMMERZ_IS_SANDBOX ? 'sandbox.sslcommerz.com' : 'securepay.sslcommerz.com',
    port: 443,
    path: '/gwprocess/v4/api.php',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.status === 'SUCCESS') {
            resolve({
              success: true,
              paymentUrl: response.GatewayPageURL,
              sessionKey: response.sessionkey,
            });
          } else {
            reject(new Error(response.failedreason || 'Failed to create payment session'));
          }
        } catch (error) {
          reject(new Error('Failed to parse SSLCOMMERZ response'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
};

/**
 * Validate SSLCOMMERZ transaction
 */
const validateTransaction = async (transactionId) => {
  const postData = new URLSearchParams({
    store_id: SSLCOMMERZ_STORE_ID,
    store_passwd: SSLCOMMERZ_STORE_PASSWORD,
    tran_id: transactionId,
  }).toString();

  const options = {
    hostname: SSLCOMMERZ_IS_SANDBOX ? 'sandbox.sslcommerz.com' : 'securepay.sslcommerz.com',
    port: 443,
    path: '/validator/api/transactionvalidationAPIv2.php',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log('SSLCOMMERZ Validation Response:', data);
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error('Failed to parse SSLCOMMERZ validation response'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
};

module.exports = {
  createPaymentSession,
  validateTransaction,
};
