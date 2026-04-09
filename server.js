import express from 'express';
import dotenv from 'dotenv';
import { initDB } from './database/tables.js';
import authRoutes from './routes/auth.routes.js';
import businessRoutes from './routes/business.routes.js';
import mpesaPublicRoutes from './routes/mpesa.public.route.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000; 

// Middleware to parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (_, res) => {
    res.status(200).json({ 
        app: 'Sensei Finance API',
        status: 'Ok',
        timestamp: new Date().toISOString()
    });
});

// Routes - protected
app.use('/api/user', authRoutes);
app.use('/api/business', businessRoutes);

// Routes - public
app.use('/api/mpesa', mpesaPublicRoutes);

// Initialize database
await initDB().then(() => {
    try {
        console.log('Database is ready');
    } catch (error) {
        console.error('Database failed to intialize');
        process.exit(1);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Sensei Finance Engine running on http://localhost:${PORT}`);
});