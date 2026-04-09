import { pool } from "../database/config.js";
import { initiateB2CWithdrawal, initiateSTKPush } from "../services/mpesa/mpesa.service.js";
import { verifyAccountOwnership } from "../services/auth/verifyOwnership.service.js";

// Deposit money to user account
export const depositFunds = async (req, res) => {
    const { phoneNumber, amount, accountId } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!phoneNumber || !amount || !accountId) {
        return res.status(400).json({ error: "Phone Number, amount and account ID are required." });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number." });
    }

    try {
        await verifyAccountOwnership(userId, accountId);

        const mpesaResponse = await initiateSTKPush(phoneNumber, parsedAmount, accountId);

        if (mpesaResponse.ResponseCode === "0") {
            await pool.query(`
                INSERT INTO mpesa_attempts (checkout_request_id, account_id, amount)
                VALUES ($1, $2, $3)
            `, [mpesaResponse.CheckoutRequestID, accountId, parsedAmount]);

            return res.status(200).json({
                message: "STK Push initiated. Please enter your PIN on your phone.",
                checkoutRequestId: mpesaResponse.CheckoutRequestID
            });
        }

        return res.status(400).json({
            error: "Mpesa request failed",
            details: mpesaResponse.CustomerMessage || mpesaResponse.errorMessage || mpesaResponse
        });
    } catch (error) {
        console.error("Deposit Error:", error);
        const status = error.message.includes('Unauthorized') ? 403 : 500;
        return res.status(status).json({ error: error.message || "Internal server error during deposit" });
    }
};

// Withdraw money from user account
export const withdrawFunds = async (req, res) => {
    const { phoneNumber, amount, accountId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!phoneNumber || !accountId || !amount) {
        return res.status(400).json({ error: 'Phone Number, amount and account ID are required.' });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    const client = await pool.connect();

    try {
        await verifyAccountOwnership(userId, accountId);
        await client.query('BEGIN');

        const accountRes = await client.query(`
            SELECT balance FROM accounts WHERE id = $1 FOR UPDATE    
        `, [accountId]);

        if (accountRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Account not found.' });
        }

        const accountBalance = Number(accountRes.rows[0].balance);

        if (accountBalance < parsedAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient funds' });
        }

        await client.query(`
            UPDATE accounts SET balance = balance - $1 WHERE id = $2
        `, [parsedAmount, accountId]);

        const mpesaRes = await initiateB2CWithdrawal(phoneNumber, parsedAmount, "Sensei withdraw");

        const txRes = await client.query(`
            INSERT INTO transactions (sender_account_id, amount, transaction_type, description)
            VALUES ($1, $2, 'withdrawal', $3)
            RETURNING id    
        `, [accountId, parsedAmount, `Withdrawal to ${phoneNumber}`]);
        const txId = txRes.rows[0].id;

        await client.query(`
            INSERT INTO ledger (transaction_id, account_id, amount, entry_type)
            VALUES ($1, $2, $3, 'debit')    
        `, [txId, accountId, parsedAmount]);

        await client.query('COMMIT');

        return res.status(200).json({
            message: 'Withdrawal initiated successfully',
            conversationId: mpesaRes.ConversationID
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Withdrawal Error:", error);
        const status = error.message.includes('Unauthorized') ? 403 : 500;
        return res.status(status).json({ error: error.message || "Withdrawal failed" });
    } finally {
        client.release();
    }

}

// Mpesa callback
export const mpesaCallback = async (req, res) => {
    console.log("🚀 CALLBACK HIT!");
    console.log("Body:", JSON.stringify(req.body, null, 2));

    res.status(200).send("OK");

    const payload = req.body;
    const client = await pool.connect();

    try {
        if (payload.Body?.stkCallback) {
            const { ResultCode, CheckoutRequestID, CallbackMetadata } = payload.Body.stkCallback;

            if (ResultCode !== 0) {
                return console.warn("User cancelled or failed PIN entry.");
            }

            const amountItem = CallbackMetadata?.Item?.find(i => i.Name === 'Amount');
            const receiptItem = CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber');

            const amount = Number(amountItem?.Value ?? 0);
            const mpesaReceipt = receiptItem?.Value ?? 'UNKNOWN';

            if (amount <= 0) {
                return console.warn(`Invalid deposit amount for CheckoutRequestID=${CheckoutRequestID}`);
            }

            await client.query('BEGIN');

            const attempt = await client.query(
                `SELECT account_id FROM mpesa_attempts WHERE checkout_request_id = $1`, 
                [CheckoutRequestID]
            );

            if (attempt.rowCount === 0) {
                await client.query('ROLLBACK');
                return console.warn(`No matching mpesa_attempts record for CheckoutRequestID=${CheckoutRequestID}`);
            }

            const accountId = attempt.rows[0].account_id;
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
            return console.log(`Success: Account ${accountId} credited with ${amount}`);
        }

        else if (payload.Result) {
            const { ResultCode, ResultDesc, ConversationID, TransactionID } = payload.Result;

            if (ResultCode !== 0) {
                console.error(`B2C Withdrawal Failed: ${ResultDesc}. Reversing funds...`);
                await client.query('BEGIN');

                const txLookup = await client.query(
                    `SELECT id, sender_account_id, amount FROM transactions 
                     WHERE description LIKE $1 AND transaction_type = 'withdrawal' 
                     ORDER BY created_at DESC LIMIT 1`, 
                    [`%${ConversationID}%`]
                );

                if (txLookup.rowCount > 0) {
                    const { sender_account_id, amount, id } = txLookup.rows[0];
                    await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amount, sender_account_id]);
                    await client.query(`INSERT INTO ledger (transaction_id, account_id, amount, entry_type) VALUES ($1, $2, $3, 'credit')`, 
                        [id, sender_account_id, amount]
                    );
                    console.log(`Refunded ${amount} KES to Account ${sender_account_id}`);
                } else {
                    console.warn(`No matching withdrawal transaction found for ConversationID=${ConversationID}`);
                }

                await client.query('COMMIT');
            } else {
                console.log(`B2C Withdrawal Confirmed: ${TransactionID}`);
            }
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Callback Processing Error:", error.message || error);
    } finally {
        client.release();
    }
};