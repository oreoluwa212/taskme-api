// src/routes/chatRoutes.js - Enhanced with suggestions
const express = require('express');
const {
    getChats,
    getChat,
    createChat,
    createChatWithSuggestion,
    sendMessage,
    createProjectFromChat,
    deleteChat,
    updateChatTitle,
    getChatSuggestions
} = require('../controllers/chatController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// All routes are protected
router.use(protect);

// Chat suggestions - NEW FEATURE
router.get('/suggestions', getChatSuggestions);           // Get personalized chat suggestions
router.post('/create-with-suggestion', createChatWithSuggestion); // Create chat from suggestion

// Basic chat operations
router.get('/', getChats);                           // Get all chats for user
router.post('/', createChat);                        // Create new chat
router.get('/:chatId', getChat);                     // Get specific chat with messages
router.post('/:chatId/messages', sendMessage);       // Send message & get AI response
router.post('/:chatId/create-project', createProjectFromChat); // Create project from chat
router.put('/:chatId/title', updateChatTitle);       // Update chat title
router.delete('/:chatId', deleteChat);               // Delete chat

module.exports = router;