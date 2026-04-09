import { loginUser, registerUser } from "../services/auth/auth.service.js";

export const register = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const newUser = await registerUser(email, password);
        
        // Return 201 Created for new resources
        return res.status(201).json({ 
            message: 'User registered successfully',
            user: { id: newUser.id, email: newUser.email } 
        });
    } catch (error) {
        // Log the real error for you, send a clean message to them
        console.error("Registration Error:", error);
        return res.status(error.message.includes('registered') ? 409 : 500)
                  .json({ error: error.message || 'Internal server error' });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // CRITICAL: Capture the result from the service
        const { token, user } = await loginUser(email, password);

        return res.status(200).json({
            message: 'User logged in',
            token, // The "hall pass" for the frontend
            user
        });
    } catch (error) {
        console.error("Login Error:", error);
        const status = error.message.includes('Invalid') ? 401 : 500;
        return res.status(status).json({ error: error.message || 'Internal server error' });
    }
};