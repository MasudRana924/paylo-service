const https = require('https');

/**
 * Create SSLCOMMERZ payment session dynamically fetching env variables
 */
const createPaymentSession = async (transactionId, amount, userId, userEmail, userName, userPhone) => {
  const storeId = process.env.SSLCOMMERZ_STORE_ID || 'mkmhe6464fe176e5aa';
  const storePasswd = process.env.SSLCOMMERZ_STORE_PASSWORD || 'mkmhe6464fe176e5aa@ssl';
  const isSandbox = process.env.SSLCOMMERZ_IS_SANDBOX === 'true' || process.env.SSLCOMMERZ_IS_SANDBOX === true || true;
  const backendUrl = (process.env.BACKEND_URL || 'http://172.31.224.1:8080').replace(/\/$/, '');

  const postData = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePasswd,
    total_amount: amount,
    currency: 'BDT',
    tran_id: transactionId,
    success_url: `${backendUrl}/api/v1/wallet/sslcommerz/success`,
    fail_url: `${backendUrl}/api/v1/wallet/sslcommerz/fail`,
    cancel_url: `${backendUrl}/api/v1/wallet/sslcommerz/cancel`,
    ipn_url: `${backendUrl}/api/v1/wallet/sslcommerz/ipn`,
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
    value_a: userId ? userId.toString() : '',
    value_b: 'ADD_MONEY',
  }).toString();

  const options = {
    hostname: isSandbox ? 'sandbox.sslcommerz.com' : 'securepay.sslcommerz.com',
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
 * Validate SSLCOMMERZ transaction dynamically fetching env variables
 * Uses official SSLCOMMERZ validationserverAPI.php endpoint
 */
const validateTransaction = async (valId, tranId) => {
  const storeId = process.env.SSLCOMMERZ_STORE_ID || 'mkmhe6464fe176e5aa';
  const storePasswd = process.env.SSLCOMMERZ_STORE_PASSWORD || 'mkmhe6464fe176e5aa@ssl';
  const isSandbox = process.env.SSLCOMMERZ_IS_SANDBOX === 'true' || process.env.SSLCOMMERZ_IS_SANDBOX === true || true;

  const hostname = isSandbox ? 'sandbox.sslcommerz.com' : 'securepay.sslcommerz.com';
  const queryParam = valId ? `val_id=${encodeURIComponent(valId)}` : `tran_id=${encodeURIComponent(tranId || '')}`;
  const path = `/validator/api/validationserverAPI.php?${queryParam}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePasswd)}&v=1&format=json`;

  const url = `https://${hostname}${path}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
          reject(new Error(`Failed to parse SSLCOMMERZ validation response: ${data}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
};

module.exports = {
  createPaymentSession,
  validateTransaction,
};
