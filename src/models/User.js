const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
    {
        firstname: {
            type: String,
            required: true,
            trim: true,
        },
        lastname: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
        },
        emailVerified: {
            type: Boolean,
            default: false,
        },
        verificationCode: String,
        verificationCodeExpires: Date,
        resetCode: {
            type: String,
            validate: {
                validator: (v) => /^\d{5}$/.test(v),
                message: (props) => `${props.value} is not a valid 5-digit code`,
            },
        },
        resetCodeExpires: Date,
    },
    {
        timestamps: true,
    }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate 5-digit verification code
userSchema.methods.generateVerificationCode = function () {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    this.verificationCode = code;
    this.verificationCodeExpires = Date.now() + 10 * 60 * 1000;
    return code;
};

// Generate 5-digit reset code
userSchema.methods.generateResetCode = function () {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    this.resetCode = code;
    this.resetCodeExpires = Date.now() + 10 * 60 * 1000;
    return code;
};

module.exports = mongoose.model('User', userSchema);
