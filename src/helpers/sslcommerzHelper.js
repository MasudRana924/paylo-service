const axios = require('axios');

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

  const apiUrl = isSandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
  const endpoint = '/gwprocess/v4/api.php';

  try {
    const response = await axios.post(`${apiUrl}${endpoint}`, postData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
    });

    const data = response.data;
    if (data.status === 'SUCCESS') {
      return {
        status: 'SUCCESS',
        paymentUrl: data.GatewayPageURL,
        sessionkey: data.sessionkey,
      };
    } else {
      throw new Error(data.error || 'Failed to create payment session');
    }
  } catch (error) {
    console.error('SSLCOMMERZ API error:', error);
    throw new Error(error.response?.data?.error || error.message || 'Failed to create payment session');
  }
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

  try {
    const response = await axios.get(url);
    console.log('SSLCOMMERZ Validation Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('SSLCOMMERZ Validation API error:', error);
    throw new Error(error.response?.data || error.message || 'Failed to validate transaction');
  }
};

module.exports = {
  createPaymentSession,
  validateTransaction,
};
