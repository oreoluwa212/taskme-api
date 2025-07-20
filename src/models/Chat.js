// src/models/Chat.js - Updated with extended chat types
const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    type: {
        type: String,
        enum: {
            values: [
                'general',
                'project_creation',
                'task_generation',
                'project_management',
                'learning_journey',          // NEW
                'productivity_planning',     // NEW
                'career_development',        // NEW
                'goal_setting',             // NEW
                'time_management',          // NEW
                'team_collaboration',       // NEW
                'risk_assessment',          // NEW
                'marketing_campaign',       // NEW
                'event_planning',           // NEW
                'business_strategy',        // NEW
                'personal_development'      // NEW
            ],
            message: '{VALUE} is not a valid chat type'
        },
        default: 'general'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // NEW: Additional metadata for better chat organization
    category: {
        type: String,
        enum: {
            values: [
                'Work',
                'Personal',
                'Education',
                'Business',
                'Creative',
                'Health',
                'Finance',
                'Technology',
                'Other'
            ],
            message: '{VALUE} is not a valid category'
        },
        default: 'Other'
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: 50
    }],
    // Track if chat was created from a suggestion
    createdFromSuggestion: {
        type: Boolean,
        default: false
    },
    suggestionId: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient user chat retrieval
chatSchema.index({ userId: 1, updatedAt: -1 });
chatSchema.index({ userId: 1, type: 1 });
chatSchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model('Chat', chatSchema);