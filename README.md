# Sensei Finance

Sensei Finance is a Node.js/Express backend API for a financial app that supports:
- user registration and login
- account management
- M-Pesa deposit via STK Push
- M-Pesa withdrawal via B2C
- PostgreSQL-backed transaction and ledger tracking

## Project Structure

- `server.js` - application entry point
- `controllers/` - request handlers and business logic orchestration
- `routes/` - Express route definitions
- `services/` - external integrations and domain-specific services
- `database/` - PostgreSQL connection and schema initialization
- `middlewares/` - authentication and request middleware

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file in the project root with the required environment variables.
3. Start the server:
   ```bash
   npm run dev
   ```

## Environment Variables

Example `.env` values required by the app:

```env
PORT=5000
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=your_database_name

MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_TOKEN_URL=https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials
MPESA_SHORTCODE=123456
MPESA_PASSKEY=your_passkey
MPESA_STK_URL=https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest
MPESA_B2C_URL=https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest
MPESA_INITIATOR_NAME=your_initiator_name
MPESA_SECURITY_CREDENTIAL=your_security_credential
MPESA_CALLBACK_URL=https://your-server.com/api/mpesa/callback
```

## API Endpoints

- `POST /api/user/register` - register a new user
- `POST /api/user/login` - login and receive JWT token
- `POST /api/mpesa/callback` - receive M-Pesa callback events

## Example Requests

### Deposit (STK Push)

- URL: `POST /api/business/deposit`
- Headers:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- Body:
  ```json
  {
    "phoneNumber": "254712345678",
    "amount": 1000,
    "accountId": "your-account-uuid"
  }
  ```

### Withdrawal (B2C Payment)

- URL: `POST /api/business/withdraw`
- Headers:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- Body:
  ```json
  {
    "phoneNumber": "254712345678",
    "amount": 500,
    "accountId": "your-account-uuid"
  }
  ```

## Notes

- The app uses PostgreSQL and requires a running database instance.
- The database schema is created automatically on startup via `database/tables.js`.
- Keep `.env` and API credentials secret.
- Add a proper authentication middleware for business routes and token validation.

## Recommended Improvements

- Add input validation for all routes
- Add proper JWT auth middleware for protected routes
- Add tests for controllers and services
- Add faster error handling and logging
- Support account ownership checks before transactions
