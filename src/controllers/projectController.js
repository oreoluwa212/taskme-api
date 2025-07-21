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
    try {
        // Create a mapping of task indices to their ObjectIds
        const indexToIdMap = {};
        subtasks.forEach((subtask, index) => {
            indexToIdMap[index] = subtask._id;
        });

        // Update dependencies for each subtask
        const updatePromises = subtasks.map(async (subtask, index) => {
            const originalDependencies = aiSubtasksData[index].dependencies;

            if (originalDependencies && Array.isArray(originalDependencies) && originalDependencies.length > 0) {
                // Convert dependency indices to ObjectIds
                const resolvedDependencies = originalDependencies
                    .map(depIndex => {
                        // Ensure the dependency index is a valid number and within range
                        const idx = parseInt(depIndex);
                        if (isNaN(idx) || idx < 0 || idx >= subtasks.length) {
                            console.warn(`Invalid dependency index: ${depIndex} for task ${index}`);
                            return null;
                        }
                        return indexToIdMap[idx];
                    })
                    .filter(id => id !== null); // Remove any invalid dependencies

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
    } catch (error) {
        console.error('Error resolving dependencies:', error);
        return subtasks; // Return original subtasks if dependency resolution fails
    }
};

// Helper function to validate and normalize project data
const normalizeProjectData = (data, source = 'form') => {
    const now = new Date();

    if (source === 'ai') {
        // Handle AI-generated project data
        const startDate = data.startDate ? new Date(data.startDate) : now;
        const dueDate = data.dueDate ? new Date(data.dueDate) : new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

        return {
            name: data.name || 'Untitled Project',
            description: data.description || '',
            timeline: parseInt(data.timeline) || 30,
            startDate,
            dueDate,
            dueTime: data.dueTime || '17:00',
            priority: data.priority || 'Medium',
            category: data.category || 'General',
            tags: Array.isArray(data.tags) ? data.tags : [],
            // AI-specific fields
            technicalRequirements: data.technicalRequirements,
            projectScope: data.projectScope,
            deliverables: data.deliverables,
            successCriteria: data.successCriteria,
            riskFactors: data.riskFactors,
            estimatedComplexity: data.estimatedComplexity,
            recommendedTeamSize: data.recommendedTeamSize,
            enhancementMetadata: data.enhancementMetadata,
            aiGenerated: true
        };
    } else {
        // Handle form-submitted data
        return {
            name: data.name,
            description: data.description,
            timeline: parseInt(data.timeline),
            startDate: new Date(data.startDate),
            dueDate: new Date(data.dueDate),
            dueTime: data.dueTime,
            priority: data.priority,
            category: data.category,
            tags: Array.isArray(data.tags) ? data.tags : [],
            aiGenerated: false
        };
    }
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
            generateAISubtasks = false,
            // New fields for AI chat integration
            chatMessage,
            isFromChat = false,
            aiProjectData
        } = req.body;

        let projectData;
        let aiResponse = null;
        let subtasks = [];

        // Handle different input sources
        if (isFromChat && chatMessage) {
            console.log('🤖 Processing chat-based project creation:', chatMessage);

            try {
                // Use the enhanced chat response method
                const chatResponse = await aiService.generateEnhancedChatResponse(chatMessage);

                if (chatResponse.type !== 'project_creation' || !chatResponse.projectData) {
                    return res.status(400).json({
                        success: false,
                        message: 'Unable to create project from chat message. Please provide more details or use the form.',
                        suggestion: 'Try describing what you want to accomplish in more detail.'
                    });
                }

                // Use the extracted project data and subtasks
                projectData = normalizeProjectData(chatResponse.projectData, 'ai');

                // The enhanced chat response already includes generated subtasks
                if (chatResponse.subtasks && chatResponse.subtasks.length > 0) {
                    aiResponse = {
                        subtasks: chatResponse.subtasks,
                        totalEstimatedHours: chatResponse.metadata?.estimatedHours || 0,
                        suggestions: ['AI-generated project from chat'],
                        fromChat: true
                    };
                }

                console.log('✅ Chat-based project data extracted successfully');
            } catch (chatError) {
                console.error('❌ Chat processing failed:', chatError);
                return res.status(400).json({
                    success: false,
                    message: 'Unable to process your request. Please try describing your project in more detail.',
                    error: process.env.NODE_ENV === 'development' ? chatError.message : undefined
                });
            }

        } else if (aiProjectData) {
            // Handle pre-processed AI project data
            console.log('📋 Processing pre-generated AI project data');
            projectData = normalizeProjectData(aiProjectData, 'ai');

            if (generateAISubtasks) {
                try {
                    aiResponse = await aiService.generateProjectTasks(projectData);
                    console.log('✅ AI subtasks generated for pre-processed data');
                } catch (aiError) {
                    console.error('❌ AI subtask generation failed:', aiError);
                    // Continue without subtasks if AI fails
                }
            }

        } else {
            // Handle traditional form submission
            console.log('📝 Processing form-based project creation');

            // Validate required fields for form submission
            if (!name || !description || !timeline || !startDate || !dueDate || !dueTime || !priority) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required for form submission'
                });
            }

            projectData = normalizeProjectData(req.body, 'form');

            // Validate dates for form submission
            if (projectData.startDate >= projectData.dueDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Due date must be after start date'
                });
            }

            // Calculate timeline consistency for form submission
            const daysDiff = Math.ceil((projectData.dueDate - projectData.startDate) / (1000 * 60 * 60 * 24));
            if (Math.abs(daysDiff - projectData.timeline) > 1) { // Allow 1 day tolerance
                console.warn('Timeline mismatch detected, adjusting timeline to match dates');
                projectData.timeline = daysDiff;
            }

            // Generate AI subtasks if requested
            if (generateAISubtasks) {
                try {
                    aiResponse = await aiService.generateProjectTasks(projectData);
                    console.log('✅ AI subtasks generated for form data');
                } catch (aiError) {
                    console.error('❌ AI subtask generation failed:', aiError);
                    // Continue without subtasks if AI fails
                }
            }
        }

        // Create the project
        const project = new Project({
            ...projectData,
            userId: req.user.id,
            progress: 0,
            status: 'Pending'
        });

        await project.save();
        console.log('✅ Project created successfully:', project._id);

        // Create subtasks if AI response exists
        if (aiResponse && aiResponse.subtasks && aiResponse.subtasks.length > 0) {
            try {
                console.log(`🔧 Creating ${aiResponse.subtasks.length} subtasks...`);

                // First, create subtasks without dependencies
                const subtaskPromises = aiResponse.subtasks.map((subtaskData, index) => {
                    // Ensure required fields have defaults
                    const cleanSubtask = {
                        title: subtaskData.title || `Task ${index + 1}`,
                        description: subtaskData.description || 'No description provided',
                        estimatedHours: subtaskData.estimatedHours || 2,
                        priority: subtaskData.priority || 'Medium',
                        order: subtaskData.order || (index + 1),
                        phase: subtaskData.phase || 'Execution',
                        complexity: subtaskData.complexity || 'Medium',
                        riskLevel: subtaskData.riskLevel || 'Low',
                        skills: Array.isArray(subtaskData.skills) ? subtaskData.skills : [],
                        tags: Array.isArray(subtaskData.tags) ? subtaskData.tags : [],
                        startDate: subtaskData.startDate || project.startDate,
                        dueDate: subtaskData.dueDate || project.dueDate,
                        projectId: project._id,
                        userId: req.user.id,
                        status: 'Pending',
                        aiGenerated: true,
                        dependencies: [] // Initialize with empty dependencies
                    };

                    return new Subtask(cleanSubtask).save();
                });

                const createdSubtasks = await Promise.all(subtaskPromises);
                console.log(`✅ Created ${createdSubtasks.length} subtasks`);

                // Now resolve and update dependencies
                subtasks = await resolveDependencies(createdSubtasks, aiResponse.subtasks);
                console.log('✅ Dependencies resolved');

                // Update project progress and status based on initial subtasks
                const projectUpdate = await updateProjectProgressAndStatus(project._id);
                if (projectUpdate) {
                    project.progress = projectUpdate.project.progress;
                    project.status = projectUpdate.project.status;
                }

            } catch (subtaskError) {
                console.error('❌ Error creating subtasks:', subtaskError);
                // Continue without subtasks if there's an error, but log the issue
            }
        }

        // Prepare response data
        const responseData = {
            project,
            subtasks,
            aiResponse: aiResponse ? {
                totalEstimatedHours: aiResponse.totalEstimatedHours || 0,
                criticalPath: aiResponse.criticalPath || [],
                suggestions: aiResponse.suggestions || [],
                wasEnhanced: isFromChat || false,
                fromChat: aiResponse.fromChat || false
            } : null
        };

        // Add chat-specific response formatting
        if (isFromChat) {
            responseData.chatMessage = `Great! I've created "${project.name}" with ${subtasks.length} tasks. The project is estimated to take ${aiResponse?.totalEstimatedHours || 0} hours and has been added to your dashboard.`;
        }

        res.status(201).json({
            success: true,
            message: isFromChat
                ? 'Project created successfully from chat message!'
                : 'Project created successfully',
            data: responseData
        });

    } catch (error) {
        console.error('❌ Create project error:', error);

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
            message: 'Server error while creating project',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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