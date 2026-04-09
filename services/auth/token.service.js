import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const jwtSecret = process.env.JWT_SECRET;

export const generateToken = (user) => {
    const payload = {
        userId: user.id,
        email: user.email
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
    return token;
};

export const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, jwtSecret);
        return decoded;
    } catch (error) {
        throw new Error('Invalid token');
    }
};

