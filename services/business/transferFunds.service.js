import { pool } from "../../database/config.js";

export const transferFunds = async (senderId, receiverId, amount, description) => {
    // 1. Immediate Logic Check
    if (senderId === receiverId) {
        throw new Error("Self-transfer is not allowed");
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 2. Verify Receiver Exists (Fail Fast)
        const receiverCheck = await client.query(
            'SELECT name FROM accounts WHERE id = $1', 
            [receiverId]
        );
        
        if (receiverCheck.rowCount === 0) {
            throw new Error("Receiver account not found");
        }

        // 3. Deterministic Locking to prevent Deadlocks
        const [firstId, secondId] = [senderId, receiverId].sort();
        await client.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [firstId]);
        await client.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [secondId]);

        // 4. Check Sender Balance
        const senderRes = await client.query(
            `SELECT balance FROM accounts WHERE id = $1`, [senderId]
        );
        
        if (Number(senderRes.rows[0].balance) < amount) {
            throw new Error("Insufficient funds");
        }

        // 5. Execute Updates
        await client.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [amount, senderId]);
        await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amount, receiverId]);

        // 6. Record Transaction & Double-Entry Ledger
        const txRes = await client.query(
            `INSERT INTO transactions (sender_account_id, receiver_account_id, amount, transaction_type, description) 
             VALUES ($1, $2, $3, 'transfer', $4) RETURNING id`,
            [senderId, receiverId, amount, description]
        );

        const txId = txRes.rows[0].id;

        await client.query(`
            INSERT INTO ledger (transaction_id, account_id, amount, entry_type) 
            VALUES ($1, $2, $3, 'debit'), ($1, $4, $3, 'credit')`,
            [txId, senderId, amount, receiverId]
        );

        await client.query('COMMIT');
        return { success: true, txId };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};