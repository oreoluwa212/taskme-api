// src/controllers/subtaskController.js
const Subtask = require('../models/Subtask');
const Project = require('../models/Project');
const { updateProjectProgressAndStatus } = require('./projectController');
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const aiService = require('../services/aiService');

// ============================================================================
// HELPER METHODS FOR AI INTEGRATION
// ============================================================================

const generateBasicTasksFromExtraction = async (extractedProject, projectData) => {
    const basicPhases = ['Planning', 'Execution', 'Review'];
    const tasksPerPhase = Math.ceil(6 / basicPhases.length);

    // Date handling - ensure proper format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Validate project start and due dates
    const projectStartDate = projectData.startDate && new Date(projectData.startDate) >= today
        ? projectData.startDate
        : todayStr;

    const projectDueDate = projectData.dueDate && new Date(projectData.dueDate) > new Date(projectStartDate)
        ? projectData.dueDate
        : new Date(Date.now() + (projectData.timeline || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const subtasks = [];
    let order = 1;

    basicPhases.forEach((phase, phaseIndex) => {
        for (let i = 0; i < tasksPerPhase && subtasks.length < 6; i++) {
            // Calculate task dates within project timeline
            const taskStartDate = phaseIndex === 0 ? projectStartDate : projectStartDate;
            const taskDueDate = phaseIndex === basicPhases.length - 1 ? projectDueDate : projectDueDate;

            subtasks.push({
                title: `${phase} Task ${i + 1} for ${projectData.name}`,
                description: `${phase} activities for ${projectData.description?.substring(0, 100)}...`,
                order: order++,
                priority: phaseIndex === 0 ? 'High' : 'Medium',
                estimatedHours: Math.max(0.5, Math.ceil((projectData.timeline || 30) / 6)),
                phase: phase,
                complexity: extractedProject.estimatedComplexity || 'Medium',
                startDate: taskStartDate,
                dueDate: taskDueDate
            });
        }
    });

    return {
        subtasks,
        totalEstimatedHours: subtasks.reduce((sum, task) => sum + task.estimatedHours, 0),
        criticalPath: [0, Math.floor(subtasks.length / 2), subtasks.length - 1],
        generatedFrom: 'chat_extraction'
    };
};

const createSubtask = async (req, res) => {
    try {
        const { projectId, title, description, order, priority, estimatedHours, phase, complexity, riskLevel, tags, skills, startDate, dueDate, dependencies } = req.body;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: 'Invalid project ID' });
        }

        const project = await Project.findOne({ _id: projectId, userId: req.user.id });
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found or unauthorized' });
        }

        // Date validation for subtask
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Validate subtask dates against project dates
        const validStartDate = startDate && new Date(startDate) >= today
            ? startDate
            : (project.startDate || todayStr);

        const validDueDate = dueDate && new Date(dueDate) > new Date(validStartDate) && new Date(dueDate) <= new Date(project.dueDate)
            ? dueDate
            : project.dueDate;

        const subtask = await Subtask.create({
            projectId,
            userId: req.user.id,
            title,
            description,
            order,
            priority,
            estimatedHours: Math.max(0.5, estimatedHours || 2),
            phase,
            complexity,
            riskLevel,
            tags,
            skills,
            startDate: validStartDate,
            dueDate: validDueDate,
            dependencies,
            status: 'Pending',
            aiGenerated: false
        });

        // Update project progress and status
        await updateProjectProgressAndStatus(projectId);

        res.status(201).json({ success: true, data: subtask });
    } catch (error) {
        console.error('Create subtask error:', error);
        res.status(500).json({ success: false, message: 'Server error while creating subtask' });
    }
};

const getProjectSubtasks = async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: 'Invalid project ID' });
        }
        const subtasks = await Subtask.find({ projectId, userId: req.user.id }).sort({ order: 1 });
        res.status(200).json({ success: true, data: subtasks });
    } catch (error) {
        console.error('Get project subtasks error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching subtasks' });
    }
};

// Enhanced fallback subtask generation
const generateFallbackSubtasks = (project) => {
    const timelineFactor = Math.max(1, Math.floor((project.timeline || 30) / 7));

    // Proper date handling for fallback subtasks
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const projectStartDate = project.startDate && new Date(project.startDate) >= today
        ? project.startDate
        : todayStr;

    const projectDueDate = project.dueDate && new Date(project.dueDate) > new Date(projectStartDate)
        ? project.dueDate
        : new Date(Date.now() + (project.timeline || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Calculate phase dates
    const projectDuration = Math.max(1, Math.floor((new Date(projectDueDate) - new Date(projectStartDate)) / (1000 * 60 * 60 * 24)));
    const phaseDuration = Math.floor(projectDuration / 3); // Divide into 3 phases

    const planningEndDate = new Date(projectStartDate);
    planningEndDate.setDate(planningEndDate.getDate() + phaseDuration);
    const planningEndStr = planningEndDate.toISOString().split('T')[0];

    const executionEndDate = new Date(projectStartDate);
    executionEndDate.setDate(executionEndDate.getDate() + (phaseDuration * 2));
    const executionEndStr = executionEndDate.toISOString().split('T')[0];

    return [
        {
            title: 'Project Planning and Requirements Analysis',
            description: `Comprehensive planning for "${project.title || project.name}" including scope definition, requirements gathering, and resource planning`,
            order: 1,
            priority: 'High',
            estimatedHours: 4 * timelineFactor,
            phase: 'Planning',
            startDate: projectStartDate,
            dueDate: planningEndStr
        },
        {
            title: 'Research and Competitive Analysis',
            description: 'Market research, competitor analysis, and best practices identification',
            order: 2,
            priority: 'High',
            estimatedHours: 6 * timelineFactor,
            phase: 'Planning',
            startDate: projectStartDate,
            dueDate: planningEndStr
        },
        {
            title: 'System Design and Architecture',
            description: 'Create detailed design documents, system architecture, and technical specifications',
            order: 3,
            priority: 'High',
            estimatedHours: 8 * timelineFactor,
            phase: 'Planning',
            startDate: projectStartDate,
            dueDate: planningEndStr
        },
        {
            title: 'Core Development and Implementation',
            description: `Develop the main features and functionality for ${project.title || project.name}`,
            order: 4,
            priority: 'High',
            estimatedHours: 16 * timelineFactor,
            phase: 'Execution',
            startDate: planningEndStr,
            dueDate: executionEndStr
        },
        {
            title: 'Integration and System Testing',
            description: 'Integrate all components, perform system testing, and resolve integration issues',
            order: 5,
            priority: 'Medium',
            estimatedHours: 8 * timelineFactor,
            phase: 'Review',
            startDate: executionEndStr,
            dueDate: projectDueDate
        },
        {
            title: 'User Acceptance Testing and Deployment',
            description: 'Conduct user testing, gather feedback, and deploy the final solution',
            order: 6,
            priority: 'Medium',
            estimatedHours: 6 * timelineFactor,
            phase: 'Review',
            startDate: executionEndStr,
            dueDate: projectDueDate
        },
        {
            title: 'Documentation and Knowledge Transfer',
            description: 'Create comprehensive documentation and conduct knowledge transfer sessions',
            order: 7,
            priority: 'Low',
            estimatedHours: 4 * timelineFactor,
            phase: 'Review',
            startDate: executionEndStr,
            dueDate: projectDueDate
        }
    ];
};

// ============================================================================
// MAIN CONTROLLER METHODS
// ============================================================================

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

    // CRITICAL DATE VALIDATION AND CORRECTION
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Remove time component
    const todayStr = today.toISOString().split('T')[0];

    // Validate and fix project startDate - MUST be today or later
    let projectStartDate = project.startDate;
    const originalStartDate = new Date(projectStartDate);

    if (!projectStartDate || originalStartDate < today) {
        projectStartDate = todayStr;
        console.log(`🔧 Correcting project start date from ${project.startDate} to ${projectStartDate}`);
        await Project.findByIdAndUpdate(projectId, { startDate: projectStartDate });
    }

    // Validate and fix project dueDate
    let projectDueDate = project.dueDate;
    const timeline = project.timeline || 30;
    const startDateObj = new Date(projectStartDate);
    const originalDueDate = new Date(projectDueDate);

    if (!projectDueDate || originalDueDate <= startDateObj) {
        const calculatedDueDate = new Date(startDateObj);
        calculatedDueDate.setDate(calculatedDueDate.getDate() + timeline);
        projectDueDate = calculatedDueDate.toISOString().split('T')[0];
        console.log(`🔧 Correcting project due date from ${project.dueDate} to ${projectDueDate}`);
        await Project.findByIdAndUpdate(projectId, { dueDate: projectDueDate });
    }

    // Prepare project data for AI service with VALIDATED dates
    const projectData = {
        name: project.title || project.name,
        title: project.title || project.name,
        description: project.description,
        timeline: timeline,
        startDate: projectStartDate, // Guaranteed to be today or later
        dueDate: projectDueDate,     // Guaranteed to be after start date
        priority: project.priority || 'Medium',
        category: project.category || 'General'
    };

    console.log('📅 Using validated project dates:', {
        startDate: projectData.startDate,
        dueDate: projectData.dueDate,
        today: todayStr,
        startDateValid: projectData.startDate >= todayStr,
        durationValid: new Date(projectData.dueDate) > new Date(projectData.startDate)
    });

    try {
        let aiResponse;

        // Try AI service first
        try {
            aiResponse = await aiService.generateProjectTasks(projectData);
            console.log('✅ Successfully used aiService.generateProjectTasks');
        } catch (aiError) {
            console.log('❌ AIService failed, using fallback:', aiError.message);
            throw new Error('AI service failed');
        }

        // Validate AI response
        if (!aiResponse || !aiResponse.subtasks || !Array.isArray(aiResponse.subtasks)) {
            throw new Error('Invalid AI response format');
        }

        // Create subtasks with STRICT date validation
        const subtaskData = aiResponse.subtasks.map((task, index) => {
            const projectStart = new Date(projectStartDate);
            const projectDue = new Date(projectDueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Parse task dates safely
            let taskStartDate = null;
            let taskDueDate = null;

            try {
                if (task.startDate) {
                    taskStartDate = new Date(task.startDate);
                }
                if (task.dueDate) {
                    taskDueDate = new Date(task.dueDate);
                }
            } catch (error) {
                console.log(`❌ Invalid date format in task ${index + 1}:`, error.message);
            }

            // Validate and correct subtask start date
            let validStartDate = projectStartDate; // Default to project start

            if (taskStartDate &&
                !isNaN(taskStartDate.getTime()) &&
                taskStartDate >= today &&
                taskStartDate >= projectStart &&
                taskStartDate <= projectDue) {
                validStartDate = task.startDate;
            } else {
                console.log(`🔧 Correcting task ${index + 1} start date to project start: ${projectStartDate}`);
            }

            // Validate and correct subtask due date
            let validDueDate = projectDueDate; // Default to project due

            if (taskDueDate &&
                !isNaN(taskDueDate.getTime()) &&
                taskDueDate >= new Date(validStartDate) &&
                taskDueDate <= projectDue) {
                validDueDate = task.dueDate;
            } else {
                // Calculate a proportional due date based on task order
                const totalTasks = aiResponse.subtasks.length;
                const taskProgress = (index + 1) / totalTasks;
                const projectDurationMs = projectDue.getTime() - projectStart.getTime();
                const taskDueDateMs = projectStart.getTime() + (projectDurationMs * taskProgress);
                const calculatedDueDate = new Date(taskDueDateMs);

                validDueDate = calculatedDueDate.toISOString().split('T')[0];
                console.log(`🔧 Calculated proportional due date for task ${index + 1}: ${validDueDate}`);
            }

            console.log(`📋 Task ${index + 1} final dates: start=${validStartDate}, due=${validDueDate}`);

            return {
                projectId,
                title: task.title,
                description: task.description,
                order: task.order || (index + 1),
                priority: task.priority || 'Medium',
                estimatedHours: Math.max(0.5, task.estimatedHours || 2),
                status: 'Pending',
                aiGenerated: true,
                phase: task.phase || 'Execution',
                complexity: task.complexity || 'Medium',
                riskLevel: task.riskLevel || 'Low',
                tags: task.tags || [],
                skills: task.skills || [],
                startDate: validStartDate, // GUARANTEED valid date >= today
                dueDate: validDueDate,     // GUARANTEED valid date within project timeline
                userId: req.user.id
            };
        });

        const distributeTasksEvenly = (tasks, projectStartDate, projectDueDate) => {
            const projectStart = new Date(projectStartDate);
            const projectDue = new Date(projectDueDate);
            const projectDurationMs = projectDue.getTime() - projectStart.getTime();
            const taskCount = tasks.length;

            return tasks.map((task, index) => {
                // Calculate start date (tasks can start at project start or be staggered)
                const taskStartProgress = index / Math.max(taskCount, 1);
                const taskStartMs = projectStart.getTime() + (projectDurationMs * taskStartProgress * 0.1); // Small stagger
                const taskStartDate = new Date(taskStartMs);

                // Calculate due date (evenly distributed across timeline)
                const taskDueProgress = (index + 1) / taskCount;
                const taskDueMs = projectStart.getTime() + (projectDurationMs * taskDueProgress);
                const taskDueDate = new Date(taskDueMs);

                return {
                    ...task,
                    startDate: taskStartDate.toISOString().split('T')[0],
                    dueDate: taskDueDate.toISOString().split('T')[0]
                };
            });
        };

        const subtasks = await Subtask.insertMany(subtaskData);

        // Update project progress and status
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
                successMetrics: aiResponse.successMetrics,
                serviceUsed: aiResponse.fromCache ? 'cached' : 'ai_generated'
            }
        });

    } catch (error) {
        console.error('AI subtask generation error:', error);

        // Enhanced fallback with guaranteed valid dates
        const fallbackSubtasks = generateFallbackSubtasks({
            ...project.toObject(),
            startDate: projectStartDate, // Use corrected start date
            dueDate: projectDueDate,     // Use corrected due date
            timeline: timeline
        });

        try {
            const subtaskData = fallbackSubtasks.map(task => ({
                ...task,
                estimatedHours: Math.max(0.5, task.estimatedHours || 2),
                projectId,
                userId: req.user.id,
                status: 'Pending',
                aiGenerated: false,
                complexity: 'Medium',
                riskLevel: 'Low',
                tags: [],
                skills: []
            }));

            const subtasks = await Subtask.insertMany(subtaskData);
            await updateProjectProgressAndStatus(projectId);

            res.status(201).json({
                success: true,
                data: subtasks,
                fallbackUsed: true,
                message: 'Subtasks generated using fallback method due to AI service error',
                error: error.message
            });
        } catch (fallbackError) {
            console.error('Fallback subtask generation error:', fallbackError);
            res.status(500).json({
                success: false,
                message: 'Failed to generate subtasks with both AI and fallback methods',
                error: fallbackError.message
            });
        }
    }
});
// ============================================================================
// HELPER METHODS FOR AI INTEGRATION
// ============================================================================
const validateAndCorrectDates = (projectData) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Correct start date if it's in the past
    if (!projectData.startDate || new Date(projectData.startDate) < today) {
        projectData.startDate = todayStr;
        console.log(`🔧 Corrected start date to: ${projectData.startDate}`);
    }

    // Correct due date if it's before or equal to start date
    const startDate = new Date(projectData.startDate);
    if (!projectData.dueDate || new Date(projectData.dueDate) <= startDate) {
        const correctedDueDate = new Date(startDate);
        correctedDueDate.setDate(correctedDueDate.getDate() + (projectData.timeline || 30));
        projectData.dueDate = correctedDueDate.toISOString().split('T')[0];
        console.log(`🔧 Corrected due date to: ${projectData.dueDate}`);
    }

    return projectData;
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

        // Define date ranges for productivity insights
        const now = new Date();
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
            { $limit: 10 }
        ]);

        // Get productivity insights - FIXED: Now using defined variables
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