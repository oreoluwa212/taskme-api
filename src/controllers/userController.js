const User = require('../models/User');
const bcrypt = require('bcrypt');
const { deleteFromCloudinary } = require('../middlewares/uploadMiddleware');

// Get current user profile
const getUserProfile = async (req, res) => {
    try {
        // req.user is set by the protect middleware
        const user = await User.findById(req.user._id).select('-password -verificationCode -verificationCodeExpires -resetCode -resetCodeExpires');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: user._id,
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.email,
                phoneNumber: user.phoneNumber,
                location: user.location,
                timezone: user.timezone,
                bio: user.bio,
                avatar: user.avatar,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile'
        });
    }
};

// Update user profile
const updateUserProfile = async (req, res) => {
    try {
        const { firstname, lastname, email, phoneNumber, location, timezone, bio } = req.body;
        const userId = req.user._id;

        // Basic validation
        if (!firstname || !lastname) {
            return res.status(400).json({
                success: false,
                message: 'First name and last name are required'
            });
        }

        // Validate timezone if provided
        const validTimezones = ['Pacific Time', 'Eastern Time', 'Central Time', 'Mountain Time'];
        if (timezone && !validTimezones.includes(timezone)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid timezone. Must be one of: Pacific Time, Eastern Time, Central Time, Mountain Time'
            });
        }

        // Validate phone number format if provided
        if (phoneNumber && phoneNumber.trim() !== '') {
            const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
            if (!phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone number format'
                });
            }
        }

        // Validate bio length
        if (bio && bio.length > 500) {
            return res.status(400).json({
                success: false,
                message: 'Bio must be 500 characters or less'
            });
        }

        // If email is being changed, check if it's already in use
        if (email && email !== req.user.email) {
            const existingUser = await User.findOne({
                email: email.toLowerCase(),
                _id: { $ne: userId }
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is already in use by another account'
                });
            }
        }

        // Prepare update object
        const updateData = {
            firstname: firstname.trim(),
            lastname: lastname.trim(),
            phoneNumber: phoneNumber ? phoneNumber.trim() : null,
            location: location ? location.trim() : null,
            timezone: timezone || 'Pacific Time',
            bio: bio ? bio.trim() : null
        };

        // Only update email if provided and different
        if (email && email !== req.user.email) {
            updateData.email = email.toLowerCase().trim();
            updateData.emailVerified = false; // Reset email verification if email changed
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            {
                new: true,
                runValidators: true
            }
        ).select('-password -verificationCode -verificationCodeExpires -resetCode -resetCodeExpires');

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                id: updatedUser._id,
                firstname: updatedUser.firstname,
                lastname: updatedUser.lastname,
                email: updatedUser.email,
                phoneNumber: updatedUser.phoneNumber,
                location: updatedUser.location,
                timezone: updatedUser.timezone,
                bio: updatedUser.bio,
                avatar: updatedUser.avatar,
                emailVerified: updatedUser.emailVerified,
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors).map(err => err.message).join(', ')
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while updating profile'
        });
    }
};

// Upload/Update avatar with enhanced error handling and logging
const uploadAvatar = async (req, res) => {
    try {
        console.log('Upload avatar controller called');
        console.log('User ID:', req.user._id);
        console.log('File info:', req.file);

        const userId = req.user._id;

        // This check should be redundant now since middleware handles it
        if (!req.file) {
            console.log('No file found in controller - this should not happen');
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        // Validate required Cloudinary properties
        if (!req.file.public_id || !req.file.secure_url) {
            console.error('Missing Cloudinary properties:', req.file);
            return res.status(500).json({
                success: false,
                message: 'Image upload failed - missing upload information'
            });
        }

        // Get current user to check for existing avatar
        console.log('Fetching current user...');
        const currentUser = await User.findById(userId);

        if (!currentUser) {
            console.log('User not found:', userId);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Delete old avatar from Cloudinary if exists
        if (currentUser.avatar && currentUser.avatar.public_id) {
            console.log('Deleting old avatar:', currentUser.avatar.public_id);
            try {
                await deleteFromCloudinary(currentUser.avatar.public_id);
                console.log('Old avatar deleted successfully');
            } catch (deleteError) {
                console.error('Error deleting old avatar:', deleteError);
                // Continue with upload even if delete fails
            }
        }

        // Update user with new avatar info
        console.log('Updating user with new avatar...');
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                avatar: {
                    public_id: req.file.public_id,
                    url: req.file.secure_url
                }
            },
            {
                new: true,
                runValidators: true
            }
        ).select('-password -verificationCode -verificationCodeExpires -resetCode -resetCodeExpires');

        if (!updatedUser) {
            console.log('User not found during update:', userId);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('Avatar uploaded successfully:', updatedUser.avatar);

        res.json({
            success: true,
            message: 'Avatar uploaded successfully',
            data: {
                avatar: updatedUser.avatar
            }
        });
    } catch (error) {
        console.error('Upload avatar error:', error);

        // Provide more specific error messages
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error: ' + Object.values(error.errors).map(err => err.message).join(', ')
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while uploading avatar: ' + error.message
        });
    }
};

// Delete avatar
const deleteAvatar = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.avatar || !user.avatar.public_id) {
            return res.status(400).json({
                success: false,
                message: 'No avatar to delete'
            });
        }

        // Delete from Cloudinary
        try {
            await deleteFromCloudinary(user.avatar.public_id);
        } catch (deleteError) {
            console.error('Error deleting from Cloudinary:', deleteError);
            // Continue with database update even if Cloudinary delete fails
        }

        // Update user to remove avatar
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                avatar: {
                    public_id: null,
                    url: null
                }
            },
            {
                new: true,
                runValidators: true
            }
        ).select('-password -verificationCode -verificationCodeExpires -resetCode -resetCodeExpires');

        res.json({
            success: true,
            message: 'Avatar deleted successfully'
        });
    } catch (error) {
        console.error('Delete avatar error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting avatar'
        });
    }
};

// Change user password
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        // Get user with password for comparison
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Check if new password is different from current
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from current password'
            });
        }

        // Update password (will be hashed by the pre-save middleware)
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors).map(err => err.message).join(', ')
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while changing password'
        });
    }
};

module.exports = {
    getUserProfile,
    updateUserProfile,
    uploadAvatar,
    deleteAvatar,
    changePassword
};