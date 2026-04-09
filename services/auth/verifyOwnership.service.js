import { pool } from "../../database/config.js";

export const verifyAccountOwnership = async (userId, accountId) => {
    const res = await pool.query(`
        SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2    
    `, [accountId, userId]);

    if(res.rowCount === 0){
        throw new Error("Unauthorized: You do not own this account");
    }

    return true;
};