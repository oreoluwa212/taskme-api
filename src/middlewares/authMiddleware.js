const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d', // Default to 7 days
    });
};

// Middleware to protect routes
const protect = async (req, res, next) => {
    try {
        let token;

        // Extract token from "Authorization" header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        // No token found
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided. Unauthorized.',
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token. Access denied.',
            });
        }

        // Check if user still exists
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User no longer exists',
            });
        }

        // Ensure email is verified
        if (!user.emailVerified) {
            return res.status(403).json({
                success: false,
                message: 'Please verify your email before accessing this route',
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized. Token may be invalid or expired.',
        });
    }
};

module.exports = {
    generateToken,
    protect,
};
