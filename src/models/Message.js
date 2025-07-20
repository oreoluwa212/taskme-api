// src/models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: {
            values: ['text', 'project_suggestion', 'task_list', 'system', 'error'],
            message: '{VALUE} is not a valid message type'
        },
        default: 'text'
    },
    sender: {
        type: String,
        enum: {
            values: ['user', 'assistant'],
            message: '{VALUE} is not a valid sender type'
        },
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: function () {
            return this.sender === 'user';
        }
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient chat message retrieval
messageSchema.index({ chatId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
