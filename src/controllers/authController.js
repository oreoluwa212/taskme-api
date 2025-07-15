const User = require('../models/User');
const { generateToken } = require('../middlewares/authMiddleware');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// Signup
const signup = async (req, res) => {
    try {
        const { firstname, lastname, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Create a new user instance (but don't save yet)
        const user = new User({ firstname, lastname, email, password });

        // Generate verification code
        const verificationCode = user.generateVerificationCode();

        // Try sending email first
        try {
            await sendVerificationEmail(email, verificationCode, firstname);
        } catch (emailError) {
            console.error('Email sending failed:', emailError);  // 👈 Add this line
            return res.status(500).json({
                success: false,
                message: 'Failed to send verification email. Please try again later.',
            });
        }


        // Now save user to DB
        await user.save();

        res.status(201).json({
            success: true,
            message: 'User created successfully. Please check your email for verification code.',
            data: {
                userId: user._id,
                email: user.email,
                firstname: user.firstname,
                lastname: user.lastname
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Verify email
const verifyEmail = async (req, res) => {
    try {
        const { email, code } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email already verified'
            });
        }

        // Check if code matches and is not expired
        if (user.verificationCode !== code || user.verificationCodeExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification code'
            });
        }

        // Mark email as verified
        user.emailVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpires = undefined;
        await user.save();

        res.json({
            success: true,
            message: 'Email verified successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Resend verification code
const resendVerificationCode = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email already verified'
            });
        }

        // Generate new verification code
        const verificationCode = user.generateVerificationCode();
        await user.save();

        // Send verification email
        await sendVerificationEmail(email, verificationCode, user.firstname);

        res.json({
            success: true,
            message: 'New verification code sent to your email'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if email is verified
        if (!user.emailVerified) {
            return res.status(401).json({
                success: false,
                message: 'Please verify your email before logging in'
            });
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    firstname: user.firstname,
                    lastname: user.lastname,
                    email: user.email
                }
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Forgot password
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate reset code
        const resetCode = user.generateResetCode();
        await user.save();

        // Send reset email
        await sendPasswordResetEmail(email, resetCode, user.firstname);

        res.json({
            success: true,
            message: 'Password reset code sent to your email'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Reset password
const resetPassword = async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if code matches and is not expired
        if (user.resetCode !== code || user.resetCodeExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset code'
            });
        }

        // Update password
        user.password = newPassword;
        user.resetCode = undefined;
        user.resetCodeExpires = undefined;
        await user.save();

        res.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Get current user profile
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    signup,
    verifyEmail,
    resendVerificationCode,
    login,
    forgotPassword,
    resetPassword,
    getProfile
};