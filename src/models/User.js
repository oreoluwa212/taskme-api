const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    firstname: {
        type: String,
        required: true,
        trim: true
    },
    lastname: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    verificationCode: {
        type: String
    },
    verificationCodeExpires: {
        type: Date
    },
    resetCode: {
        type: String
    },
    resetCodeExpires: {
        type: Date
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate verification code
userSchema.methods.generateVerificationCode = function() {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    this.verificationCode = code;
    this.verificationCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    return code;
};

// Generate reset code
userSchema.methods.generateResetCode = function() {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    this.resetCode = code;
    this.resetCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    return code;
};

module.exports = mongoose.model('User', userSchema);