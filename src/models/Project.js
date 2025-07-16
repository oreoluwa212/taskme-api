// src/models/Project.js
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Project name is required'],
        trim: true,
        maxlength: [100, 'Project name cannot exceed 100 characters']
    },
    description: {
        type: String,
        required: [true, 'Project description is required'],
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    timeline: {
        type: Number,
        required: [true, 'Project timeline is required'],
        min: [1, 'Timeline must be at least 1 day']
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required']
    },
    dueDate: {
        type: Date,
        required: [true, 'Due date is required']
    },
    dueTime: {
        type: String,
        required: [true, 'Due time is required'],
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Due time must be in HH:MM format']
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        required: [true, 'Priority level is required'],
        default: 'Medium'
    },
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Completed'],
        default: 'Pending'
    },
    progress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Add tags for better categorization and search
    tags: [{
        type: String,
        trim: true
    }],
    // Add category for better organization
    category: {
        type: String,
        trim: true,
        maxlength: [50, 'Category cannot exceed 50 characters']
    }
}, {
    timestamps: true
});

// Enhanced indexes for better query performance
projectSchema.index({ userId: 1, status: 1 });
projectSchema.index({ userId: 1, priority: 1 });
projectSchema.index({ userId: 1, dueDate: 1 });
projectSchema.index({ userId: 1, startDate: 1 });
projectSchema.index({ userId: 1, progress: 1 });

// Text index for full-text search
projectSchema.index({
    name: 'text',
    description: 'text',
    category: 'text',
    tags: 'text'
});

// Compound index for common queries
projectSchema.index({ userId: 1, status: 1, priority: 1 });
projectSchema.index({ userId: 1, dueDate: 1, status: 1 });

// Virtual for checking if project is overdue
projectSchema.virtual('isOverdue').get(function () {
    const now = new Date();
    const dueDateTime = new Date(this.dueDate);
    const [hours, minutes] = this.dueTime.split(':');
    dueDateTime.setHours(parseInt(hours), parseInt(minutes));

    return now > dueDateTime && this.status !== 'Completed';
});

// Virtual for days remaining
projectSchema.virtual('daysRemaining').get(function () {
    const now = new Date();
    const dueDateTime = new Date(this.dueDate);
    const [hours, minutes] = this.dueTime.split(':');
    dueDateTime.setHours(parseInt(hours), parseInt(minutes));

    const diff = dueDateTime - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual for completion percentage display
projectSchema.virtual('completionStatus').get(function () {
    if (this.progress === 0) return 'Not Started';
    if (this.progress < 25) return 'Just Started';
    if (this.progress < 50) return 'In Progress';
    if (this.progress < 75) return 'More Than Half';
    if (this.progress < 100) return 'Almost Done';
    return 'Completed';
});

// FIXED: Pre-save middleware to update status based on progress
projectSchema.pre('save', function (next) {
    // Only update status if progress field is being modified
    if (this.isModified('progress')) {
        if (this.progress === 0) {
            this.status = 'Pending';
        } else if (this.progress > 0 && this.progress < 100) {
            this.status = 'In Progress';
        } else if (this.progress === 100) {
            this.status = 'Completed';
        }
    }
    next();
});

// Enhanced static method to get user project statistics
projectSchema.statics.getUserStats = async function (userId) {
    const stats = await this.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    // Get additional statistics
    const additionalStats = await this.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: null,
                averageProgress: { $avg: '$progress' },
                totalProjects: { $sum: 1 },
                highPriorityCount: {
                    $sum: { $cond: [{ $eq: ['$priority', 'High'] }, 1, 0] }
                },
                overdueCount: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $lt: ['$dueDate', new Date()] },
                                    { $ne: ['$status', 'Completed'] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        }
    ]);

    const result = {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        averageProgress: 0,
        highPriorityCount: 0,
        overdueCount: 0
    };

    stats.forEach(stat => {
        result.total += stat.count;
        if (stat._id === 'Pending') result.pending = stat.count;
        else if (stat._id === 'In Progress') result.inProgress = stat.count;
        else if (stat._id === 'Completed') result.completed = stat.count;
    });

    if (additionalStats.length > 0) {
        result.averageProgress = Math.round(additionalStats[0].averageProgress || 0);
        result.highPriorityCount = additionalStats[0].highPriorityCount || 0;
        result.overdueCount = additionalStats[0].overdueCount || 0;
    }

    return result;
};

// Static method for full-text search
projectSchema.statics.textSearch = async function (userId, searchQuery, options = {}) {
    const {
        status,
        priority,
        limit = 10,
        skip = 0,
        sortBy = 'score'
    } = options;

    let query = {
        userId: new mongoose.Types.ObjectId(userId),
        $text: { $search: searchQuery }
    };

    // Add filters
    if (status) query.status = status;
    if (priority) query.priority = priority;

    let sort = {};
    if (sortBy === 'score') {
        sort = { score: { $meta: 'textScore' } };
    } else {
        sort[sortBy] = -1;
    }

    const projects = await this.find(query, { score: { $meta: 'textScore' } })
        .sort(sort)
        .skip(skip)
        .limit(limit);

    const total = await this.countDocuments(query);

    return { projects, total };
};

// Static method to get projects by category
projectSchema.statics.getProjectsByCategory = async function (userId) {
    const categories = await this.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 },
                projects: { $push: '$$ROOT' }
            }
        },
        { $sort: { count: -1 } }
    ]);

    return categories;
};

// Make virtuals available in JSON output
projectSchema.set('toJSON', { virtuals: true });
projectSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Project', projectSchema);