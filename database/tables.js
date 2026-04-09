import { pool } from "./config.js";

export const initDB = async () => {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // User table: id, email, password_hash, created_at, updated_at
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )    
    `);

    // Account table: id, user_id, name, balance, currency, created_at, updated_at
    await pool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            name VARCHAR(255) NOT NULL,
            balance NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
            currency TEXT NOT NULL DEFAULT 'KES',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )    
    `);

    // Transaction table: id, sender_account_id, receiver_account_id, amount, transaction_type, description, created_at
    await pool.query(`
        CREATE TABLE IF NOT EXISTS transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sender_account_id UUID REFERENCES accounts(id),
            receiver_account_id UUID REFERENCES accounts(id),
            amount NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
            transaction_type TEXT NOT NULL CHECK (transaction_type IN ('transfer', 'deposit', 'withdrawal')),
            description TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )    
    `);

    // ledger: id, transaction_id, account_id, amount, entry_type (debit/credit), created_at
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ledger (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            transaction_id UUID NOT NULL REFERENCES transactions(id),
            account_id UUID NOT NULL REFERENCES accounts(id),
            amount NUMERIC(20, 2) NOT NULL,
            entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )    
    `);

    // Mpesa attempts: id, checkout_request_id, account_id, amount, created_at
    await pool.query(`
       CREATE TABLE IF NOT EXISTS mpesa_attempts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            checkout_request_id TEXT NOT NULL,
            account_id UUID REFERENCES accounts(id) NOT NULL,
            amount NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
       ) 
    `);
    
    // await pool.query(`CREATE INDEX idx_accounts_user_id ON accounts(user_id)`);
    // await pool.query(`CREATE INDEX idx_transactions_sender ON transactions(sender_account_id)`);
    // await pool.query(`CREATE INDEX idx_transactions_receiver ON transactions(receiver_account_id)`);
    // await pool.query(`CREATE INDEX idx_ledger_account_id ON ledger(account_id)`);
    // await pool.query(`CREATE INDEX idx_ledger_transaction_id ON ledger(transaction_id)`);
    // await pool.query(` CREATE INDEX idx_mpesa_attempts_account_id ON mpesa_attempts(account_id)`);
};
