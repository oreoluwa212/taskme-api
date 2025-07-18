// src/models/Subtask.js
const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Subtask title is required'],
        trim: true,
        maxlength: [200, 'Subtask title cannot exceed 200 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    estimatedHours: {
        type: Number,
        min: [0.5, 'Estimated hours must be at least 0.5'],
        max: [100, 'Estimated hours cannot exceed 100']
    },
    actualHours: {
        type: Number,
        min: [0, 'Actual hours cannot be negative'],
        default: 0
    },
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Completed', 'Blocked'],
        default: 'Pending'
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    order: {
        type: Number,
        required: true,
        min: 1
    },
    startDate: {
        type: Date
    },
    dueDate: {
        type: Date
    },
    completedDate: {
        type: Date
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    aiGenerated: {
        type: Boolean,
        default: false
    },
    dependencies: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subtask'
    }],
    tags: [{
        type: String,
        trim: true
    }],
    notes: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Indexes for better query performance
subtaskSchema.index({ projectId: 1, order: 1 });
subtaskSchema.index({ userId: 1, status: 1 });
subtaskSchema.index({ projectId: 1, status: 1 });
subtaskSchema.index({ dueDate: 1, status: 1 });

// Pre-save middleware to set completion date
subtaskSchema.pre('save', function (next) {
    if (this.isModified('status')) {
        if (this.status === 'Completed' && !this.completedDate) {
            this.completedDate = new Date();
        } else if (this.status !== 'Completed') {
            this.completedDate = undefined;
        }
    }
    next();
});

// Virtual for checking if subtask is overdue
subtaskSchema.virtual('isOverdue').get(function () {
    if (!this.dueDate || this.status === 'Completed') return false;
    return new Date() > this.dueDate;
});

// Static method to get project completion percentage
subtaskSchema.statics.getProjectProgress = async function (projectId) {
    const stats = await this.aggregate([
        { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const totalTasks = stats.reduce((sum, stat) => sum + stat.count, 0);
    const completedTasks = stats.find(stat => stat._id === 'Completed')?.count || 0;

    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
};

// Static method to get user subtask statistics
subtaskSchema.statics.getUserSubtaskStats = async function (userId) {
    const stats = await this.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalHours: { $sum: '$estimatedHours' },
                actualHours: { $sum: '$actualHours' }
            }
        }
    ]);

    const result = {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        blocked: 0,
        totalEstimatedHours: 0,
        totalActualHours: 0,
        overdueTasks: 0
    };

    stats.forEach(stat => {
        result.total += stat.count;
        result.totalEstimatedHours += stat.totalHours || 0;
        result.totalActualHours += stat.actualHours || 0;

        switch (stat._id) {
            case 'Pending': result.pending = stat.count; break;
            case 'In Progress': result.inProgress = stat.count; break;
            case 'Completed': result.completed = stat.count; break;
            case 'Blocked': result.blocked = stat.count; break;
        }
    });

    // Get overdue tasks count
    const overdueCount = await this.countDocuments({
        userId: new mongoose.Types.ObjectId(userId),
        dueDate: { $lt: new Date() },
        status: { $nin: ['Completed'] }
    });

    result.overdueTasks = overdueCount;

    return result;
};

subtaskSchema.set('toJSON', { virtuals: true });
subtaskSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Subtask', subtaskSchema);