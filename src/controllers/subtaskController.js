// src/controllers/subtaskController.js
const Subtask = require('../models/Subtask');
const Project = require('../models/Project');
const aiService = require('../services/aiService');
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
        description: project.description,
        timeline: project.timeline || 30, // Default to 30 days if not specified
        startDate: project.startDate || new Date().toISOString(),
        dueDate: project.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        priority: project.priority || 'Medium',
        category: project.category || 'General'
    };

    try {
        // Use the correct method from aiService
        const aiResponse = await aiService.generateProjectTasks(projectData);

        if (!aiResponse.subtasks || !Array.isArray(aiResponse.subtasks)) {
            return res.status(400).json({
                success: false,
                message: 'Failed to generate valid subtasks from AI'
            });
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
                status: 'Pending', // Fixed: Use proper enum value
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
                status: 'Pending', // Fixed: Use proper enum value
                aiGenerated: false,
                complexity: 'Medium',
                riskLevel: 'Low',
                tags: [],
                skills: []
            }))
        );

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

        // Calculate project progress
        const progress = await Subtask.getProjectProgress(projectId);

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

        const subtask = await Subtask.findOneAndUpdate(
            { _id: subtaskId, userId: req.user.id },
            updateData,
            { new: true, runValidators: true }
        );

        if (!subtask) {
            return res.status(404).json({
                success: false,
                message: 'Subtask not found'
            });
        }

        // Update project progress if subtask status changed
        if (updateData.status) {
            const projectProgress = await Subtask.getProjectProgress(subtask.projectId);
            await Project.findByIdAndUpdate(subtask.projectId, {
                progress: projectProgress
            });
        }

        res.status(200).json({
            success: true,
            message: 'Subtask updated successfully',
            data: subtask
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

        // Update project progress after deletion
        const projectProgress = await Subtask.getProjectProgress(subtask.projectId);
        await Project.findByIdAndUpdate(subtask.projectId, {
            progress: projectProgress
        });

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

// Get subtask statistics
const getSubtaskStats = async (req, res) => {
    try {
        const stats = await Subtask.getUserSubtaskStats(req.user.id);

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Get subtask stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching subtask statistics'
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
    getSubtaskStats
};