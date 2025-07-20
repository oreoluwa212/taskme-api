// src/controllers/subtaskController.js
const Subtask = require('../models/Subtask');
const Project = require('../models/Project');
const aiService = require('../services/aiService');
const { updateProjectProgressAndStatus } = require('./projectController');
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');

// Generate AI-powered subtasks for a project
const generateSubtasks = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { regenerate = false } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Authorization check
    if (project.userId.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (regenerate) {
        await Subtask.deleteMany({ projectId });
    }

    // Prepare project data for AI service
    const projectData = {
        name: project.title,
        title: project.title, // Add both for compatibility
        description: project.description,
        timeline: project.timeline || 30,
        startDate: project.startDate || new Date().toISOString(),
        dueDate: project.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        priority: project.priority || 'Medium',
        category: project.category || 'General'
    };

    try {
        let aiResponse;

        // Try to use the correct method based on your aiService structure
        if (aiService.aiChatService && typeof aiService.aiChatService.generateProjectTasks === 'function') {
            // If aiService exports { aiChatService, aiProjectService }
            aiResponse = await aiService.aiChatService.generateProjectTasks(projectData);
        } else if (aiService.generateProjectTasks && typeof aiService.generateProjectTasks === 'function') {
            // If aiService directly exports the method
            aiResponse = await aiService.generateProjectTasks(projectData);
        } else if (aiService.aiProjectService && typeof aiService.aiProjectService.generateProjectTasks === 'function') {
            // If there's an aiProjectService
            aiResponse = await aiService.aiProjectService.generateProjectTasks(projectData);
        } else {
            // If none of the above work, throw an error to trigger fallback
            throw new Error('generateProjectTasks method not found in aiService');
        }

        if (!aiResponse || !aiResponse.subtasks || !Array.isArray(aiResponse.subtasks)) {
            throw new Error('Invalid AI response format');
        }

        // Convert AI response to subtasks format
        const subtasks = await Subtask.insertMany(
            aiResponse.subtasks.map((task, index) => ({
                projectId,
                title: task.title,
                description: task.description,
                order: task.order || (index + 1),
                priority: task.priority || 'Medium',
                estimatedHours: task.estimatedHours || 2,
                status: 'Pending',
                aiGenerated: true,
                phase: task.phase || 'Execution',
                complexity: task.complexity || 'Medium',
                riskLevel: task.riskLevel || 'Low',
                tags: task.tags || [],
                skills: task.skills || [],
                startDate: task.startDate,
                dueDate: task.dueDate,
                userId: req.user.id
            }))
        );

        // Update project progress and status after generating subtasks
        await updateProjectProgressAndStatus(projectId);

        res.status(201).json({
            success: true,
            data: subtasks,
            aiInsights: {
                totalEstimatedHours: aiResponse.totalEstimatedHours,
                criticalPath: aiResponse.criticalPath,
                milestones: aiResponse.milestones,
                riskFactors: aiResponse.riskFactors,
                suggestions: aiResponse.suggestions,
                resources: aiResponse.resources,
                projectInsights: aiResponse.projectInsights,
                recommendedTeamSize: aiResponse.recommendedTeamSize,
                estimatedBudget: aiResponse.estimatedBudget,
                successMetrics: aiResponse.successMetrics
            }
        });

    } catch (error) {
        console.error('AI subtask generation error:', error);

        // Fallback to simple subtask generation
        const fallbackSubtasks = [
            {
                title: 'Project Planning and Setup',
                description: 'Define project scope, requirements, and set up initial structure',
                order: 1,
                priority: 'High',
                estimatedHours: 4,
                phase: 'Planning'
            },
            {
                title: 'Research and Analysis',
                description: 'Conduct necessary research and analyze requirements',
                order: 2,
                priority: 'High',
                estimatedHours: 6,
                phase: 'Planning'
            },
            {
                title: 'Design and Architecture',
                description: 'Create design documents and system architecture',
                order: 3,
                priority: 'High',
                estimatedHours: 8,
                phase: 'Planning'
            },
            {
                title: 'Core Implementation',
                description: 'Implement the main features and functionality',
                order: 4,
                priority: 'High',
                estimatedHours: 16,
                phase: 'Execution'
            },
            {
                title: 'Testing and Quality Assurance',
                description: 'Test all components and ensure quality standards',
                order: 5,
                priority: 'Medium',
                estimatedHours: 6,
                phase: 'Review'
            },
            {
                title: 'Documentation and Deployment',
                description: 'Create documentation and deploy the solution',
                order: 6,
                priority: 'Medium',
                estimatedHours: 4,
                phase: 'Review'
            }
        ];

        const subtasks = await Subtask.insertMany(
            fallbackSubtasks.map(task => ({
                ...task,
                projectId,
                userId: req.user.id,
                status: 'Pending',
                aiGenerated: false,
                complexity: 'Medium',
                riskLevel: 'Low',
                tags: [],
                skills: []
            }))
        );

        // Update project progress and status after generating fallback subtasks
        await updateProjectProgressAndStatus(projectId);

        res.status(201).json({
            success: true,
            data: subtasks,
            fallbackUsed: true,
            message: 'Subtasks generated using fallback method due to AI service error'
        });
    }
});

// Get all subtasks for a project
const getProjectSubtasks = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { status, priority, sortBy = 'order', sortOrder = 'asc' } = req.query;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        // Verify project belongs to user
        const project = await Project.findOne({
            _id: projectId,
            userId: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        let query = { projectId, userId: req.user.id };

        // Apply filters
        if (status) query.status = status;
        if (priority) query.priority = priority;

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const subtasks = await Subtask.find(query)
            .sort(sortOptions)
            .populate('dependencies', 'title status');

        // Update project progress and status
        const projectUpdate = await updateProjectProgressAndStatus(projectId);
        const progress = projectUpdate ? projectUpdate.stats : null;

        res.status(200).json({
            success: true,
            count: subtasks.length,
            progress,
            data: subtasks
        });
    } catch (error) {
        console.error('Get project subtasks error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching subtasks'
        });
    }
};

// Create a new subtask
const createSubtask = async (req, res) => {
    try {
        const { projectId } = req.params;
        const subtaskData = req.body;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        // Verify project belongs to user
        const project = await Project.findOne({
            _id: projectId,
            userId: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // If no order specified, set it to the last position
        if (!subtaskData.order) {
            const lastSubtask = await Subtask.findOne({ projectId })
                .sort({ order: -1 })
                .select('order');
            subtaskData.order = lastSubtask ? lastSubtask.order + 1 : 1;
        }

        const subtask = new Subtask({
            ...subtaskData,
            projectId,
            userId: req.user.id,
            aiGenerated: false
        });

        await subtask.save();

        // Update project progress and status after creating subtask
        await updateProjectProgressAndStatus(projectId);

        res.status(201).json({
            success: true,
            message: 'Subtask created successfully',
            data: subtask
        });
    } catch (error) {
        console.error('Create subtask error:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while creating subtask'
        });
    }
};

// Update a subtask
const updateSubtask = async (req, res) => {
    try {
        const { subtaskId } = req.params;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(subtaskId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subtask ID'
            });
        }

        // Get the original subtask to check for status changes
        const originalSubtask = await Subtask.findOne({
            _id: subtaskId,
            userId: req.user.id
        });

        if (!originalSubtask) {
            return res.status(404).json({
                success: false,
                message: 'Subtask not found'
            });
        }

        // Add completedDate if status is being changed to Completed
        if (updateData.status === 'Completed' && originalSubtask.status !== 'Completed') {
            updateData.completedDate = new Date();
        }

        // Remove completedDate if status is being changed from Completed to something else
        if (updateData.status && updateData.status !== 'Completed' && originalSubtask.status === 'Completed') {
            updateData.completedDate = null;
        }

        const subtask = await Subtask.findOneAndUpdate(
            { _id: subtaskId, userId: req.user.id },
            updateData,
            { new: true, runValidators: true }
        );

        // Update project progress and status after updating subtask
        // This is especially important when status changes
        const projectUpdate = await updateProjectProgressAndStatus(originalSubtask.projectId);

        res.status(200).json({
            success: true,
            message: 'Subtask updated successfully',
            data: subtask,
            projectUpdate: projectUpdate ? {
                progress: projectUpdate.project.progress,
                status: projectUpdate.project.status
            } : null
        });
    } catch (error) {
        console.error('Update subtask error:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while updating subtask'
        });
    }
};

// Delete a subtask
const deleteSubtask = async (req, res) => {
    try {
        const { subtaskId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(subtaskId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subtask ID'
            });
        }

        const subtask = await Subtask.findOneAndDelete({
            _id: subtaskId,
            userId: req.user.id
        });

        if (!subtask) {
            return res.status(404).json({
                success: false,
                message: 'Subtask not found'
            });
        }

        // Remove this subtask from dependencies of other subtasks
        await Subtask.updateMany(
            { dependencies: subtaskId },
            { $pull: { dependencies: subtaskId } }
        );

        // Update project progress and status after deletion
        await updateProjectProgressAndStatus(subtask.projectId);

        res.status(200).json({
            success: true,
            message: 'Subtask deleted successfully'
        });
    } catch (error) {
        console.error('Delete subtask error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting subtask'
        });
    }
};

// Reorder subtasks
const reorderSubtasks = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { subtaskIds } = req.body; // Array of subtask IDs in new order

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        if (!Array.isArray(subtaskIds)) {
            return res.status(400).json({
                success: false,
                message: 'subtaskIds must be an array'
            });
        }

        // Verify project belongs to user
        const project = await Project.findOne({
            _id: projectId,
            userId: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Update order for each subtask
        const updatePromises = subtaskIds.map((subtaskId, index) => {
            return Subtask.findOneAndUpdate(
                { _id: subtaskId, userId: req.user.id, projectId },
                { order: index + 1 },
                { new: true }
            );
        });

        const updatedSubtasks = await Promise.all(updatePromises);

        res.status(200).json({
            success: true,
            message: 'Subtasks reordered successfully',
            data: updatedSubtasks.filter(Boolean) // Remove null values
        });
    } catch (error) {
        console.error('Reorder subtasks error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while reordering subtasks'
        });
    }
};

// Bulk update subtasks status
const bulkUpdateSubtasks = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { subtaskIds, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        if (!Array.isArray(subtaskIds) || subtaskIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'subtaskIds must be a non-empty array'
            });
        }

        if (!['Pending', 'In Progress', 'Completed', 'Blocked'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        // Verify project belongs to user
        const project = await Project.findOne({
            _id: projectId,
            userId: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Prepare update data
        const updateData = { status };
        if (status === 'Completed') {
            updateData.completedDate = new Date();
        } else {
            updateData.completedDate = null;
        }

        // Bulk update subtasks
        const result = await Subtask.updateMany(
            {
                _id: { $in: subtaskIds },
                projectId,
                userId: req.user.id
            },
            updateData
        );

        // Update project progress and status
        await updateProjectProgressAndStatus(projectId);

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} subtasks updated successfully`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Bulk update subtasks error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while bulk updating subtasks'
        });
    }
};

// Enhanced get subtask statistics with all subtasks data and pagination
const getSubtaskStats = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            status,
            priority,
            dateFrom,
            dateTo,
            dueDateFrom,
            dueDateTo,
            includeCompleted = true,
            groupBy = 'day' // day, week, month
        } = req.query;

        const userId = req.user.id;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build base query
        let query = { userId: new mongoose.Types.ObjectId(userId) };

        // Apply filters
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (includeCompleted === 'false') query.status = { $ne: 'Completed' };

        // Date range filters for creation date
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) query.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
        }

        // Date range filters for due date
        if (dueDateFrom || dueDateTo) {
            query.dueDate = {};
            if (dueDateFrom) query.dueDate.$gte = new Date(dueDateFrom);
            if (dueDateTo) query.dueDate.$lte = new Date(dueDateTo + 'T23:59:59.999Z');
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Get paginated subtasks with project details
        const subtasks = await Subtask.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('projectId', 'title description category priority')
            .populate('dependencies', 'title status')
            .lean();

        // Get total count for pagination
        const totalCount = await Subtask.countDocuments(query);
        const totalPages = Math.ceil(totalCount / parseInt(limit));

        // Get overall statistics
        const stats = await Subtask.aggregate([
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

        // Format stats
        const formattedStats = {
            total: 0,
            pending: 0,
            inProgress: 0,
            completed: 0,
            blocked: 0,
            totalEstimatedHours: 0,
            totalActualHours: 0
        };

        stats.forEach(stat => {
            formattedStats.total += stat.count;
            formattedStats.totalEstimatedHours += stat.totalHours || 0;
            formattedStats.totalActualHours += stat.actualHours || 0;

            switch (stat._id) {
                case 'Pending': formattedStats.pending = stat.count; break;
                case 'In Progress': formattedStats.inProgress = stat.count; break;
                case 'Completed': formattedStats.completed = stat.count; break;
                case 'Blocked': formattedStats.blocked = stat.count; break;
            }
        });

        // Get overdue tasks count
        const overdueCount = await Subtask.countDocuments({
            userId: new mongoose.Types.ObjectId(userId),
            dueDate: { $lt: new Date() },
            status: { $nin: ['Completed'] }
        });

        formattedStats.overdueTasks = overdueCount;

        // Get time-based grouping
        let groupFormat;
        switch (groupBy) {
            case 'week':
                groupFormat = { $dateToString: { format: "%Y-W%U", date: "$createdAt" } };
                break;
            case 'month':
                groupFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
                break;
            default: // day
                groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
        }

        const timeGroupedStats = await Subtask.aggregate([
            { $match: query },
            {
                $group: {
                    _id: groupFormat,
                    count: { $sum: 1 },
                    completed: {
                        $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] }
                    },
                    pending: {
                        $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] }
                    },
                    inProgress: {
                        $sum: { $cond: [{ $eq: ["$status", "In Progress"] }, 1, 0] }
                    },
                    blocked: {
                        $sum: { $cond: [{ $eq: ["$status", "Blocked"] }, 1, 0] }
                    },
                    totalEstimatedHours: { $sum: '$estimatedHours' }
                }
            },
            { $sort: { _id: -1 } },
            { $limit: 30 } // Last 30 time periods
        ]);

        // Get priority distribution
        const priorityStats = await Subtask.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 },
                    completedCount: {
                        $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] }
                    }
                }
            }
        ]);

        // Get project-wise breakdown
        const projectStats = await Subtask.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$projectId',
                    count: { $sum: 1 },
                    completed: {
                        $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] }
                    },
                    totalHours: { $sum: '$estimatedHours' }
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'project'
                }
            },
            { $unwind: '$project' },
            {
                $project: {
                    projectTitle: '$project.title',
                    projectCategory: '$project.category',
                    count: 1,
                    completed: 1,
                    totalHours: 1,
                    completionRate: {
                        $cond: [
                            { $eq: ['$count', 0] },
                            0,
                            { $multiply: [{ $divide: ['$completed', '$count'] }, 100] }
                        ]
                    }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 } // Top 10 projects by task count
        ]);

        // Calculate productivity insights
        const now = new Date();
        const lastWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const lastMonth = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const productivityInsights = {
            thisWeek: await Subtask.countDocuments({
                userId: new mongoose.Types.ObjectId(userId),
                completedDate: { $gte: lastWeek },
                status: 'Completed'
            }),
            thisMonth: await Subtask.countDocuments({
                userId: new mongoose.Types.ObjectId(userId),
                completedDate: { $gte: lastMonth },
                status: 'Completed'
            }),
            averageCompletionTime: await Subtask.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(userId),
                        status: 'Completed',
                        createdAt: { $exists: true },
                        completedDate: { $exists: true }
                    }
                },
                {
                    $project: {
                        completionTimeHours: {
                            $divide: [
                                { $subtract: ['$completedDate', '$createdAt'] },
                                1000 * 60 * 60 // Convert to hours
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgCompletionTime: { $avg: '$completionTimeHours' }
                    }
                }
            ])
        };

        res.status(200).json({
            success: true,
            data: {
                subtasks,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalCount,
                    hasNext: parseInt(page) < totalPages,
                    hasPrev: parseInt(page) > 1,
                    limit: parseInt(limit)
                },
                statistics: {
                    overview: formattedStats,
                    timeGrouped: timeGroupedStats,
                    priority: priorityStats,
                    projects: projectStats,
                    productivity: productivityInsights
                },
                filters: {
                    status,
                    priority,
                    dateFrom,
                    dateTo,
                    dueDateFrom,
                    dueDateTo,
                    groupBy,
                    sortBy,
                    sortOrder
                }
            }
        });

    } catch (error) {
        console.error('Get subtask stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching subtask statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    generateSubtasks,
    getProjectSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    reorderSubtasks,
    bulkUpdateSubtasks,
    getSubtaskStats
};