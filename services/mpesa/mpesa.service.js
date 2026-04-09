import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Get mpesa tokem
const getMpesaToken = async () => {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const URL = process.env.MPESA_TOKEN_URL;

    const auth = Buffer.from(`${key}:${secret}`).toString('base64');

    try {
        const res = await axios.get(URL, {
            headers: {
                Authorization: `Basic ${auth}`,
            },
        });

        return res.data.access_token;
    } catch (error) {
        console.error("Mpesa Token Error:", error.res?.data || error.message);
        throw new Error("Failed to authenticate with Safaricom");
    }
};

// Initiate STK push
export const initiateSTKPush = async (phoneNumber, amount, accountReference) => {
    const shortCode = process.env.MPESA_SHORTCODE;
    const passKey = process.env.MPESA_PASSKEY;
    const STK_URL = process.env.MPESA_STK_URL;
    const token = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(shortCode + passKey + timestamp).toString('base64');

    const data = {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phoneNumber, // e.g., 254712345678
        PartyB: shortCode,
        PhoneNumber: phoneNumber,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: accountReference, // e.g., User's Account UUID
        TransactionDesc: "Sensei Finance Deposit"
    };

    try {
        const res = await axios.post(
            STK_URL, 
            data, 
            { headers: {Authorization: `Bearer ${token}`} }
        );
        return res.data;
    } catch (error) {
        console.error("STK Push Error:", error.response?.data || error.message);
        throw error; 
    }
};

// Initiate B2C withdrawal
export const initiateB2CWithdrawal = async (phoneNumber, amount, remarks) => {
    const token = await getMpesaToken();
    const B2C_URL = process.env.MPESA_B2C_URL;
    const originatorConversationID = `SENSEI-${Date.now()}`; 

    const data = {
        InitiatorName: process.env.MPESA_INITIATOR_NAME, // From Daraja Portal
        SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL, 
        CommandID: "BusinessPayment", // or SalaryPayment/PromotionPayment
        Amount: amount,
        PartyA: process.env.MPESA_SHORTCODE,
        PartyB: phoneNumber,
        Remarks: remarks || "Withdrawal from Sensei Finance",
        QueueTimeOutURL: process.env.MPESA_CALLBACK_URL,
        ResultURL: process.env.MPESA_CALLBACK_URL,
        Occasion: "Withdrawal",
        OriginatorConversationID: originatorConversationID
    };

    const res = await axios.post(B2C_URL, data, {
        headers: { Authorization: `Bearer ${token}` }
    });

    return res.data;
};