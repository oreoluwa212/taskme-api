// src/controllers/projectController.js
const Project = require('../models/Project');
const mongoose = require('mongoose');

// Helper function to determine status based on progress
const getStatusFromProgress = (progress) => {
    if (progress === 0) return 'Pending';
    if (progress > 0 && progress < 100) return 'In Progress';
    if (progress === 100) return 'Completed';
    return 'Pending'; // fallback
};

// Create a new project
const createProject = async (req, res) => {
    try {
        const { name, description, timeline, startDate, dueDate, dueTime, priority } = req.body;

        // Validate required fields
        if (!name || !description || !timeline || !startDate || !dueDate || !dueTime || !priority) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const due = new Date(dueDate);

        if (start >= due) {
            return res.status(400).json({
                success: false,
                message: 'Due date must be after start date'
            });
        }

        // Calculate timeline consistency
        const daysDiff = Math.ceil((due - start) / (1000 * 60 * 60 * 24));
        if (daysDiff !== parseInt(timeline)) {
            return res.status(400).json({
                success: false,
                message: 'Timeline does not match the difference between start and due dates'
            });
        }

        const project = new Project({
            name,
            description,
            timeline: parseInt(timeline),
            startDate: start,
            dueDate: due,
            dueTime,
            priority,
            userId: req.user.id
        });

        await project.save();

        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            data: project
        });
    } catch (error) {
        console.error('Create project error:', error);

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
            message: 'Server error while creating project'
        });
    }
};

// Get all projects for the authenticated user with enhanced search
const getProjects = async (req, res) => {
    try {
        const {
            status,
            priority,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            page = 1,
            limit = 10
        } = req.query;

        let query = { userId: req.user.id };

        // Filter by status
        if (status && ['Pending', 'In Progress', 'Completed'].includes(status)) {
            query.status = status;
        }

        // Filter by priority
        if (priority && ['Low', 'Medium', 'High'].includes(priority)) {
            query.priority = priority;
        }

        // Add search functionality
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            query.$or = [
                { name: searchRegex },
                { description: searchRegex }
            ];
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const projects = await Project.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count for pagination
        const total = await Project.countDocuments(query);

        res.status(200).json({
            success: true,
            count: projects.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: projects
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching projects'
        });
    }
};

// Advanced search with multiple criteria
const searchProjects = async (req, res) => {
    try {
        const {
            query: searchQuery,
            status,
            priority,
            startDateFrom,
            startDateTo,
            dueDateFrom,
            dueDateTo,
            progressMin = 0,
            progressMax = 100,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            page = 1,
            limit = 10
        } = req.query;

        let query = { userId: req.user.id };

        // Text search
        if (searchQuery && searchQuery.trim()) {
            const searchRegex = new RegExp(searchQuery.trim(), 'i');
            query.$or = [
                { name: searchRegex },
                { description: searchRegex }
            ];
        }

        // Filter by status
        if (status && ['Pending', 'In Progress', 'Completed'].includes(status)) {
            query.status = status;
        }

        // Filter by priority
        if (priority && ['Low', 'Medium', 'High'].includes(priority)) {
            query.priority = priority;
        }

        // Date range filters
        if (startDateFrom || startDateTo) {
            query.startDate = {};
            if (startDateFrom) query.startDate.$gte = new Date(startDateFrom);
            if (startDateTo) query.startDate.$lte = new Date(startDateTo);
        }

        if (dueDateFrom || dueDateTo) {
            query.dueDate = {};
            if (dueDateFrom) query.dueDate.$gte = new Date(dueDateFrom);
            if (dueDateTo) query.dueDate.$lte = new Date(dueDateTo);
        }

        // Progress range filter
        if (progressMin !== undefined || progressMax !== undefined) {
            query.progress = {};
            if (progressMin !== undefined) query.progress.$gte = parseInt(progressMin);
            if (progressMax !== undefined) query.progress.$lte = parseInt(progressMax);
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const projects = await Project.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count for pagination
        const total = await Project.countDocuments(query);

        res.status(200).json({
            success: true,
            count: projects.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            searchCriteria: {
                query: searchQuery,
                status,
                priority,
                startDateFrom,
                startDateTo,
                dueDateFrom,
                dueDateTo,
                progressMin,
                progressMax
            },
            data: projects
        });
    } catch (error) {
        console.error('Search projects error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while searching projects'
        });
    }
};

// Get a single project by ID
const getProject = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        const project = await Project.findOne({
            _id: id,
            userId: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        res.status(200).json({
            success: true,
            data: project
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching project'
        });
    }
};

// Update a project
const updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        // If dates are being updated, validate them
        if (updateData.startDate && updateData.dueDate) {
            const start = new Date(updateData.startDate);
            const due = new Date(updateData.dueDate);

            if (start >= due) {
                return res.status(400).json({
                    success: false,
                    message: 'Due date must be after start date'
                });
            }
        }

        // If progress is being updated, also update the status
        if (updateData.progress !== undefined) {
            updateData.status = getStatusFromProgress(updateData.progress);
        }

        const project = await Project.findOneAndUpdate(
            { _id: id, userId: req.user.id },
            updateData,
            { new: true, runValidators: true }
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Project updated successfully',
            data: project
        });
    } catch (error) {
        console.error('Update project error:', error);

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
            message: 'Server error while updating project'
        });
    }
};

// Delete a project
const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        const project = await Project.findOneAndDelete({
            _id: id,
            userId: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting project'
        });
    }
};

// Get project statistics
const getProjectStats = async (req, res) => {
    try {
        const stats = await Project.getUserStats(req.user.id);

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Get project stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching project statistics'
        });
    }
};

// Update project progress (with automatic status update)
const updateProjectProgress = async (req, res) => {
    try {
        const { id } = req.params;
        const { progress } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        if (progress < 0 || progress > 100) {
            return res.status(400).json({
                success: false,
                message: 'Progress must be between 0 and 100'
            });
        }

        // Determine the new status based on progress
        const newStatus = getStatusFromProgress(progress);

        const project = await Project.findOneAndUpdate(
            { _id: id, userId: req.user.id },
            {
                progress: progress,
                status: newStatus  // Explicitly set the status
            },
            { new: true, runValidators: true }
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Get updated stats after progress change
        const stats = await Project.getUserStats(req.user.id);

        res.status(200).json({
            success: true,
            message: 'Project progress updated successfully',
            data: {
                project,
                stats
            }
        });
    } catch (error) {
        console.error('Update project progress error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating project progress'
        });
    }
};

module.exports = {
    createProject,
    getProjects,
    getProject,
    updateProject,
    deleteProject,
    getProjectStats,
    updateProjectProgress,
    searchProjects
};