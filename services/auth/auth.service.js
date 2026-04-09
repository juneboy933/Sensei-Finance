import { pool } from "../../database/config.js";
import bcrypt from "bcrypt";
import { generateToken } from "./token.service.js";

export const registerUser = async (email, password) => {
    // Hash the password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if email already exists
        const userExists = await client.query(`
            SELECT 1 FROM users WHERE email = $1    
        `, [email]);

        if(userExists.rowCount > 0){
            throw new Error('Email already registered');
        }


        // Insert new user and create default account
        const newUser = await client.query(`
            INSERT INTO users (email, password_hash) 
            VALUES ($1, $2)
            RETURNING id, email, created_at    
        `, [email, passwordHash]);

        const accountName = `${email.split('@')[0]}'s Wallet`;
        const userId = newUser.rows[0].id;

        await client.query(`
            INSERT INTO accounts (user_id, name)  
            VALUES ($1, $2)
            RETURNING id, name, balance, currency, created_at  
        `, [userId, accountName]);

        await client.query('COMMIT');

        return newUser.rows[0];
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const loginUser = async (email, password) => {
    try {
        const userRes = await pool.query(`
            SELECT id , email, password_hash FROM users WHERE email = $1    
        `, [email]);

        if(userRes.rowCount === 0){
            throw new Error('Invalid email or password');
        }

        const user = userRes.rows[0];
        const passwordHash = user.password_hash;
        const isMatch = await bcrypt.compare(password, passwordHash);

        if(!isMatch){
            throw new Error('Invalid email or password');
        }

        const token = generateToken(user);
        return { token, user: { id: user.id, email: user.email } };
    } catch (error) {
        throw error;
    }
};