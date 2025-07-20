const express = require('express');
const User = require('../models/User');
const { protect } = require('../middlewares/authMiddleware');
const { uploadAvatar, handleMulterError } = require('../middlewares/uploadMiddleware');
const {
  getUserProfile,
  updateUserProfile,
  changePassword,
  uploadAvatar: uploadAvatarController,
  deleteAvatar
} = require('../controllers/userController');
const router = express.Router();

// GET all users (public route for testing)
router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password -verificationCode -verificationCodeExpires -resetCode -resetCodeExpires');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create user (public route for testing)
router.post('/', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    // Don't return password in response
    const userResponse = user.toObject();
    delete userResponse.password;
    res.status(201).json(userResponse);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Protected routes - require authentication
router.use(protect);

// IMPORTANT: Put specific routes BEFORE parameterized routes
// GET /api/users/profile - Get current user profile
router.get('/profile', getUserProfile);

// PUT /api/users/profile - Update user profile
router.put('/profile', updateUserProfile);

// POST /api/users/avatar - Upload/Update avatar
router.post('/avatar', uploadAvatar, handleMulterError, uploadAvatarController);

// DELETE /api/users/avatar - Delete avatar
router.delete('/avatar', deleteAvatar);

// PUT /api/users/change-password - Change user password
router.put('/change-password', changePassword);

// GET user by ID - This should come AFTER specific routes
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -verificationCode -verificationCodeExpires -resetCode -resetCodeExpires');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;