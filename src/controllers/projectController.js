// src/controllers/projectController.js
const Project = require('../models/Project');
const Subtask = require('../models/Subtask');
const aiService = require('../services/aiService');
const mongoose = require('mongoose');

// Helper function to determine status based on progress and subtask statuses
const getStatusFromProgress = (progress, subtaskStats = null) => {
    if (progress === 0) return 'Pending';
    if (progress === 100) return 'Completed';

    // If we have subtask stats, use them for more accurate status determination
    if (subtaskStats) {
        const { totalSubtasks, inProgressSubtasks, completedSubtasks } = subtaskStats;

        // If any subtask is in progress or some are completed, project is in progress
        if (inProgressSubtasks > 0 || (completedSubtasks > 0 && completedSubtasks < totalSubtasks)) {
            return 'In Progress';
        }

        // If all subtasks are completed
        if (completedSubtasks === totalSubtasks && totalSubtasks > 0) {
            return 'Completed';
        }
    }

    // Fallback based on progress
    if (progress > 0 && progress < 100) return 'In Progress';
    return 'Pending';
};

// Enhanced function to update project progress and status
const updateProjectProgressAndStatus = async (projectId) => {
    try {
        const project = await Project.findById(projectId);
        if (!project) return null;

        // Get subtask statistics
        const subtaskStats = await Subtask.aggregate([
            { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const stats = {
            totalSubtasks: 0,
            completedSubtasks: 0,
            pendingSubtasks: 0,
            inProgressSubtasks: 0,
            blockedSubtasks: 0
        };

        subtaskStats.forEach(stat => {
            stats.totalSubtasks += stat.count;

            switch (stat._id) {
                case 'Completed': stats.completedSubtasks = stat.count; break;
                case 'Pending': stats.pendingSubtasks = stat.count; break;
                case 'In Progress': stats.inProgressSubtasks = stat.count; break;
                case 'Blocked': stats.blockedSubtasks = stat.count; break;
            }
        });

        // Calculate progress
        let progress = 0;
        if (stats.totalSubtasks > 0) {
            progress = Math.round((stats.completedSubtasks / stats.totalSubtasks) * 100);
        }

        // Determine new status
        const newStatus = getStatusFromProgress(progress, stats);

        // Update project
        const updatedProject = await Project.findByIdAndUpdate(
            projectId,
            {
                progress: progress,
                status: newStatus
            },
            { new: true }
        );

        return {
            project: updatedProject,
            stats
        };

    } catch (error) {
        console.error('Error updating project progress and status:', error);
        return null;
    }
};

// Helper function to resolve dependencies after all subtasks are created
const resolveDependencies = async (subtasks, aiSubtasksData) => {
    // Create a mapping of task titles to their ObjectIds
    const titleToIdMap = {};
    subtasks.forEach((subtask, index) => {
        const originalTitle = aiSubtasksData[index].title;
        titleToIdMap[originalTitle] = subtask._id;
    });

    // Update dependencies for each subtask
    const updatePromises = subtasks.map(async (subtask, index) => {
        const originalDependencies = aiSubtasksData[index].dependencies;

        if (originalDependencies && Array.isArray(originalDependencies) && originalDependencies.length > 0) {
            // Convert dependency titles to ObjectIds
            const resolvedDependencies = originalDependencies
                .map(depTitle => {
                    // Handle both string and array formats from AI
                    const cleanTitle = Array.isArray(depTitle) ? depTitle[0] : depTitle;
                    return titleToIdMap[cleanTitle];
                })
                .filter(id => id !== undefined); // Remove any unresolved dependencies

            if (resolvedDependencies.length > 0) {
                return await Subtask.findByIdAndUpdate(
                    subtask._id,
                    { dependencies: resolvedDependencies },
                    { new: true }
                );
            }
        }

        return subtask;
    });

    return await Promise.all(updatePromises);
};

// Create a new project with optional AI generation
const createProject = async (req, res) => {
    try {
        const {
            name,
            description,
            timeline,
            startDate,
            dueDate,
            dueTime,
            priority,
            category,
            tags,
            generateAISubtasks = false  // New option
        } = req.body;

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
            category,
            tags,
            userId: req.user.id
        });

        await project.save();

        let aiResponse = null;
        let subtasks = [];

        // Generate AI subtasks if requested
        if (generateAISubtasks) {
            try {
                aiResponse = await aiService.generateProjectTasks({
                    name: project.name,
                    description: project.description,
                    timeline: project.timeline,
                    startDate: project.startDate,
                    dueDate: project.dueDate,
                    priority: project.priority
                });

                // First, create subtasks without dependencies
                const subtaskPromises = aiResponse.subtasks.map(subtaskData => {
                    const { dependencies, ...subtaskWithoutDeps } = subtaskData;
                    return new Subtask({
                        ...subtaskWithoutDeps,
                        projectId: project._id,
                        userId: req.user.id,
                        aiGenerated: true,
                        dependencies: [] // Initialize with empty dependencies
                    }).save();
                });

                const createdSubtasks = await Promise.all(subtaskPromises);

                // Now resolve and update dependencies
                subtasks = await resolveDependencies(createdSubtasks, aiResponse.subtasks);

                // Update project progress and status based on initial subtasks
                const projectUpdate = await updateProjectProgressAndStatus(project._id);
                if (projectUpdate) {
                    project.progress = projectUpdate.project.progress;
                    project.status = projectUpdate.project.status;
                }

            } catch (aiError) {
                console.error('AI generation error:', aiError);
                // Continue without AI subtasks if there's an error
            }
        }

        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            data: {
                project,
                subtasks,
                aiResponse: aiResponse ? {
                    totalEstimatedHours: aiResponse.totalEstimatedHours,
                    criticalPath: aiResponse.criticalPath,
                    suggestions: aiResponse.suggestions
                } : null
            }
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
            category,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            page = 1,
            limit = 10,
            includeSubtasks = false
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

        // Filter by category
        if (category) {
            query.category = new RegExp(category, 'i');
        }

        // Add search functionality
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            query.$or = [
                { name: searchRegex },
                { description: searchRegex },
                { category: searchRegex },
                { tags: { $in: [searchRegex] } }
            ];
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let projectQuery = Project.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        // Populate subtasks if requested
        if (includeSubtasks === 'true') {
            projectQuery = projectQuery.populate({
                path: 'subtasks',
                select: 'title status priority estimatedHours actualHours order'
            });
        }

        const projects = await projectQuery.lean();

        // Get total count for pagination
        const total = await Project.countDocuments(query);

        // Add subtask counts and progress for each project (and update status if needed)
        const projectsWithStats = await Promise.all(
            projects.map(async (project) => {
                const subtaskStats = await Subtask.aggregate([
                    { $match: { projectId: project._id } },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 },
                            totalHours: { $sum: '$estimatedHours' }
                        }
                    }
                ]);

                const stats = {
                    totalSubtasks: 0,
                    completedSubtasks: 0,
                    pendingSubtasks: 0,
                    inProgressSubtasks: 0,
                    totalEstimatedHours: 0
                };

                subtaskStats.forEach(stat => {
                    stats.totalSubtasks += stat.count;
                    stats.totalEstimatedHours += stat.totalHours || 0;

                    if (stat._id === 'Completed') stats.completedSubtasks = stat.count;
                    else if (stat._id === 'Pending') stats.pendingSubtasks = stat.count;
                    else if (stat._id === 'In Progress') stats.inProgressSubtasks = stat.count;
                });

                // Calculate current progress
                let currentProgress = 0;
                if (stats.totalSubtasks > 0) {
                    currentProgress = Math.round((stats.completedSubtasks / stats.totalSubtasks) * 100);
                }

                // Check if project status needs updating
                const expectedStatus = getStatusFromProgress(currentProgress, stats);
                if (project.status !== expectedStatus || project.progress !== currentProgress) {
                    // Update project in background
                    Project.findByIdAndUpdate(project._id, {
                        progress: currentProgress,
                        status: expectedStatus
                    }).exec();

                    // Update the returned data
                    project.progress = currentProgress;
                    project.status = expectedStatus;
                }

                return {
                    ...project,
                    subtaskStats: stats
                };
            })
        );

        res.status(200).json({
            success: true,
            count: projects.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: projectsWithStats
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching projects'
        });
    }
};

// Get a single project by ID with detailed information
const getProject = async (req, res) => {
    try {
        const { id } = req.params;
        const { includeSubtasks = false } = req.query;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        let project = await Project.findOne({
            _id: id,
            userId: req.user.id
        }).lean();

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Get subtasks if requested
        let subtasks = [];
        if (includeSubtasks === 'true') {
            subtasks = await Subtask.find({ projectId: id })
                .sort({ order: 1 })
                .populate('dependencies', 'title status');
        }

        // Get project statistics and update project if needed
        const stats = await Subtask.aggregate([
            { $match: { projectId: new mongoose.Types.ObjectId(id) } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalEstimatedHours: { $sum: '$estimatedHours' },
                    totalActualHours: { $sum: '$actualHours' }
                }
            }
        ]);

        const projectStats = {
            totalSubtasks: 0,
            completedSubtasks: 0,
            pendingSubtasks: 0,
            inProgressSubtasks: 0,
            blockedSubtasks: 0,
            totalEstimatedHours: 0,
            totalActualHours: 0,
            completionPercentage: 0
        };

        stats.forEach(stat => {
            projectStats.totalSubtasks += stat.count;
            projectStats.totalEstimatedHours += stat.totalEstimatedHours || 0;
            projectStats.totalActualHours += stat.totalActualHours || 0;

            switch (stat._id) {
                case 'Completed': projectStats.completedSubtasks = stat.count; break;
                case 'Pending': projectStats.pendingSubtasks = stat.count; break;
                case 'In Progress': projectStats.inProgressSubtasks = stat.count; break;
                case 'Blocked': projectStats.blockedSubtasks = stat.count; break;
            }
        });

        if (projectStats.totalSubtasks > 0) {
            projectStats.completionPercentage = Math.round(
                (projectStats.completedSubtasks / projectStats.totalSubtasks) * 100
            );
        }

        // Check if project needs status/progress update
        const expectedStatus = getStatusFromProgress(projectStats.completionPercentage, projectStats);
        if (project.status !== expectedStatus || project.progress !== projectStats.completionPercentage) {
            // Update project
            const updatedProject = await Project.findByIdAndUpdate(id, {
                progress: projectStats.completionPercentage,
                status: expectedStatus
            }, { new: true }).lean();

            project = updatedProject;
        }

        res.status(200).json({
            success: true,
            data: {
                project,
                subtasks,
                stats: projectStats
            }
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching project'
        });
    }
};

// Update a project with automatic progress recalculation
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

        // Don't allow manual progress updates if subtasks exist
        if (updateData.progress !== undefined) {
            const subtaskCount = await Subtask.countDocuments({ projectId: id });
            if (subtaskCount > 0) {
                delete updateData.progress; // Remove manual progress update
                delete updateData.status; // Remove manual status update
                console.log('Manual progress/status update ignored - calculated from subtasks');
            }
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

        // Recalculate progress and status from subtasks
        const projectUpdate = await updateProjectProgressAndStatus(id);
        if (projectUpdate && (projectUpdate.project.progress !== project.progress || projectUpdate.project.status !== project.status)) {
            project.progress = projectUpdate.project.progress;
            project.status = projectUpdate.project.status;
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

// Delete a project and all its subtasks
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

        // Delete all associated subtasks
        await Subtask.deleteMany({ projectId: id, userId: req.user.id });

        res.status(200).json({
            success: true,
            message: 'Project and all associated subtasks deleted successfully'
        });
    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting project'
        });
    }
};

// Get comprehensive project statistics
const getProjectStats = async (req, res) => {
    try {
        const stats = await Project.getUserStats(req.user.id);

        // Get additional insights
        const additionalStats = await Project.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
            {
                $group: {
                    _id: null,
                    totalEstimatedHours: { $sum: '$estimatedHours' },
                    averageTimeline: { $avg: '$timeline' },
                    projectsThisMonth: {
                        $sum: {
                            $cond: [
                                {
                                    $gte: ['$createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        // Get category distribution
        const categoryStats = await Project.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    averageProgress: { $avg: '$progress' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                ...stats,
                additionalStats: additionalStats[0] || {},
                categoryStats
            }
        });
    } catch (error) {
        console.error('Get project stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching project statistics'
        });
    }
};

// Update project progress manually (only if no subtasks exist)
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

        // Check if subtasks exist
        const subtaskCount = await Subtask.countDocuments({ projectId: id });
        if (subtaskCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot manually update progress when subtasks exist. Progress is calculated from subtasks.'
            });
        }

        const newStatus = getStatusFromProgress(progress);

        const project = await Project.findOneAndUpdate(
            { _id: id, userId: req.user.id },
            {
                progress: progress,
                status: newStatus
            },
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
            message: 'Project progress updated successfully',
            data: project
        });
    } catch (error) {
        console.error('Update project progress error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating project progress'
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
            category,
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
                { description: searchRegex },
                { category: searchRegex },
                { tags: { $in: [searchRegex] } }
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

        // Filter by category
        if (category) {
            query.category = new RegExp(category, 'i');
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
                category,
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

module.exports = {
    createProject,
    getProjects,
    getProject,
    updateProject,
    deleteProject,
    getProjectStats,
    updateProjectProgress,
    searchProjects,
    updateProjectProgressAndStatus // Export the helper function for use in subtask controller
};