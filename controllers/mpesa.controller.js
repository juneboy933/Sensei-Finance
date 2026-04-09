import { pool } from "../database/config.js";
import { initiateB2CWithdrawal, initiateSTKPush } from "../services/mpesa/mpesa.service.js";

// Deposit money to user account
export const depositFunds = async (req, res) => {
    const { phoneNumber, amount, accountId } = req.body;
    const userId = req.user.userId;

    // Check if auth middleware provided the user
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    if (!phoneNumber || !amount || !accountId) {
        return res.status(400).json({ error: "Phone Number, amount and account ID are required." });
    }

    try {
        const mpesaResponse = await initiateSTKPush(phoneNumber, amount, accountId);

        // Safaricom ResponseCode is a string "0" for success
        if (mpesaResponse.ResponseCode === "0") {
            await pool.query(`
                INSERT INTO mpesa_attempts (checkout_request_id, account_id, amount)
                VALUES ($1, $2, $3)    
            `, [mpesaResponse.CheckoutRequestID, accountId, amount]);
            
            return res.status(200).json({
                message: "STK Push initiated. Please enter your PIN on your phone.",
                checkoutRequestId: mpesaResponse.CheckoutRequestID
            });
        } else {
            return res.status(400).json({
                error: "Mpesa request failed",
                details: mpesaResponse.CustomerMessage
            });
        }
    } catch (error) {
        console.error("Deposit Error:", error);
        return res.status(500).json({ error: "Internal server error during deposit" });
    }
};

// Withdraw money from user account
export const withdrawFunds = async (req, res) => {
    const { phoneNumber, amount, accountId } = req.body;
    const userId = req.user.userId;

    if(!userId){
        return res.status(401).json({ error: 'Unauthorized'});
    }

    if(!phoneNumber || !accountId || !amount){
        return res.status(400).json({ error: 'Phone Number, amount and account ID are required.'})
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Check the balance and lock the account row
        const accountRes = await client.query(`
            SELECT balance FROM accounts WHERE id = $1 FOR UPDATE    
        `, [accountId]);

        if(accountRes.rowCount === 0) throw new Error('Account not found.');
        const accountBalance = accountRes.rows[0].balance;

        if(accountBalance < amount){
            return res.status(400).json({ error: 'Insufficient funds'});
        }

        // Deduct funds internally
        await client.query(`
            UPDATE accounts SET balance = balance - $1 WHERE id = $2
        `, [amount, accountId]);

        // trigger B2C Withdrawal engine
        const mpesaRes = await initiateB2CWithdrawal(phoneNumber, amount, "Sensei withdraw");

        // Record transaction
        const txRes = await client.query(`
            INSERT INTO transactions (sender_account_id, amount, transaction_type, description)
            VALUES ($1, $2, 'withdrawal', $3)
            RETURNING id    
        `, [accountId, amount, `Withdrawal to ${phoneNumber}`])
        const txId = txRes.rows[0].id;

        // Ledger - debit User
        await client.query(`
            INSERT INTO ledger (transaction_id, account_id, amount, entry_type)
            VALUES ($1, $2, $3, 'debit')    
        `, [txId, accountId, amount]);

        await client.query('COMMIT');

        return res.status(200).json({
            message: 'Withdrawal initiated successfully',
            conversationId: mpesaRes.ConversationID
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Withdrawal Error:", error);
        return res.status(500).json({ error: error.message || "Withdrawal failed" });
    } finally {
        client.release();
    }

}

// Mpesa callback
export const mpesaCallback = async (req, res) => {
    console.log("🚀 CALLBACK HIT!"); // If you don't see this in terminal, Ngrok/Route is the issue.
    console.log("Body:", JSON.stringify(req.body, null, 2));

    // 1. Acknowledge receipt immediately
    res.status(200).send("OK");

    const payload = req.body;
    const client = await pool.connect();

    try {
        // --- CASE 1: STK PUSH (DEPOSIT) ---
        if (payload.Body?.stkCallback) {
            const { ResultCode, CheckoutRequestID, CallbackMetadata } = payload.Body.stkCallback;

            if (ResultCode !== 0) return console.warn("User cancelled or failed PIN entry.");

            // Safaricom metadata is an array; finding items safely is key
            const amountItem = CallbackMetadata.Item.find(i => i.Name === 'Amount');
            const receiptItem = CallbackMetadata.Item.find(i => i.Name === 'MpesaReceiptNumber');

            const amount = amountItem ? amountItem.Value : 0;
            const mpesaReceipt = receiptItem ? receiptItem.Value : 'UNKNOWN';

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
        
                const attempt = await client.query(
                    `SELECT account_id FROM mpesa_attempts WHERE checkout_request_id = $1`, 
                    [CheckoutRequestID]
                );

                if (attempt.rowCount > 0) {
                const accountId = attempt.rows[0].account_id;

                // FIX: Ensure you use the "SET" keyword and handle numeric types
                await client.query(
                    `UPDATE accounts SET balance = balance + $1 WHERE id = $2`, 
                    [amount, accountId]
                );

                const tx = await client.query(`
                    INSERT INTO transactions (receiver_account_id, amount, transaction_type, description)
                    VALUES ($1, $2, 'deposit', $3) RETURNING id`, 
                    [accountId, amount, `M-Pesa Deposit: ${mpesaReceipt}`]
                );

                await client.query(`
                    INSERT INTO ledger (transaction_id, account_id, amount, entry_type) 
                    VALUES ($1, $2, $3, 'credit')`, 
                    [tx.rows[0].id, accountId, amount]
                );

                await client.query('COMMIT');
                console.log(`Success: Account ${accountId} credited with ${amount}`);
            }
        } catch (e) {
            await client.query('ROLLBACK');
            console.error("DB Update Failed:", e.message);
        } finally {
            client.release();
        }
    }

        // --- CASE 2: B2C (WITHDRAWAL) ---
        else if (payload.Result) {
            const { ResultCode, ResultDesc, ConversationID, TransactionID } = payload.Result;

            if (ResultCode !== 0) {
                // If B2C fails, we must REVERSE the deduction we did in the controller
                console.error(`B2C Withdrawal Failed: ${ResultDesc}. Reversing funds...`);
                
                await client.query('BEGIN');
                // Find the original pending transaction to get accountId and amount
                const txLookup = await client.query(
                    `SELECT id, sender_account_id, amount FROM transactions 
                     WHERE description LIKE $1 AND transaction_type = 'withdrawal' 
                     ORDER BY created_at DESC LIMIT 1`, 
                    [`%${ConversationID}%`]
                );

                if (txLookup.rowCount > 0) {
                    const { sender_account_id, amount, id } = txLookup.rows[0];
                    // Refund the user
                    await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amount, sender_account_id]);
                    await client.query(`INSERT INTO ledger (transaction_id, account_id, amount, entry_type) VALUES ($1, $2, $3, 'credit')`, 
                        [id, sender_account_id, amount]
                    );
                    console.log(`Refunded ${amount} KES to Account ${sender_account_id}`);
                }
                await client.query('COMMIT');
            } else {
                console.log(`B2C Withdrawal Confirmed: ${TransactionID}`);
                // Optional: Update transaction description with the real M-Pesa Receipt ID
            }
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Callback Processing Error:", error.message);
    } finally {
        client.release();
    }
};