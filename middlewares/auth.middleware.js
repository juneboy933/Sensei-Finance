import { verifyToken } from "../services/auth/token.service.js";

export const protectUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    // Check if header exists and starts with 'Bearer '
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Token not provided' });
    }

    try {
        const decoded = verifyToken(token);
        // Attach user info for the next middleware/controller
        req.user = decoded; 
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
};