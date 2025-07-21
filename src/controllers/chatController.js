// src/controllers/chatController.js - Fixed with proper chat types
const asyncHandler = require('express-async-handler');
const aiChatService = require('../services/aiChatService');
const aiService = require('../services/aiService');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Project = require('../models/Project');
const Subtask = require('../models/Subtask');

// Get chat suggestions for users
const getChatSuggestions = asyncHandler(async (req, res) => {
    try {
        // Get user's recent activity for personalization
        const recentChats = await Chat.find({ userId: req.user.id })
            .sort({ updatedAt: -1 })
            .limit(3)
            .select('type title category');

        const recentProjects = await Project.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(2)
            .select('name category');

        // Base suggestions with VALID chat types
        const baseSuggestions = {
            project_creation: [
                {
                    id: 'website_redesign',
                    title: "Plan a Website Redesign",
                    description: "Create a complete project plan for redesigning a company website",
                    prompt: "I need to redesign our company website. Can you help me create a detailed project plan with phases, tasks, and timeline?",
                    category: "Technology",
                    chatType: "project_creation",
                    estimatedTime: "15-20 min chat"
                },
                {
                    id: 'mobile_app_dev',
                    title: "Mobile App Development",
                    description: "Structure a mobile app development project from concept to launch",
                    prompt: "I want to develop a mobile app. Help me break down the entire development process into manageable tasks with timeline and milestones.",
                    category: "Technology",
                    chatType: "project_creation",
                    estimatedTime: "20-25 min chat"
                },
                {
                    id: 'marketing_campaign',
                    title: "Marketing Campaign Launch",
                    description: "Organize a comprehensive marketing campaign with deliverables and deadlines",
                    prompt: "I'm launching a new product and need to create a marketing campaign. Can you help me plan all the tasks, timeline, and deliverables?",
                    category: "Business",
                    chatType: "marketing_campaign",
                    estimatedTime: "10-15 min chat"
                },
                {
                    id: 'event_planning',
                    title: "Event Planning Project",
                    description: "Plan a corporate event or conference with all necessary preparations",
                    prompt: "I need to organize a corporate conference for 200+ attendees. Help me create a detailed project plan with all tasks, vendors, and deadlines.",
                    category: "Business",
                    chatType: "event_planning",
                    estimatedTime: "15-20 min chat"
                }
            ],
            task_generation: [
                {
                    id: 'goal_breakdown',
                    title: "Break Down Complex Goals",
                    description: "Turn your big goals into actionable daily tasks",
                    prompt: "I have this big goal: [describe your goal]. Can you help me break it down into specific, actionable tasks with priorities and deadlines?",
                    category: "Personal",
                    chatType: "goal_setting",
                    estimatedTime: "5-10 min chat"
                },
                {
                    id: 'weekly_planning',
                    title: "Weekly Planning Session",
                    description: "Organize your week with prioritized tasks and time blocks",
                    prompt: "Help me plan my upcoming week. I have these priorities and commitments: [list them]. Create a structured task list and schedule for me.",
                    category: "Personal",
                    chatType: "time_management",
                    estimatedTime: "10-15 min chat"
                },
                {
                    id: 'learning_plan',
                    title: "Learning Plan Creation",
                    description: "Create a structured learning path for any skill",
                    prompt: "I want to learn [skill/subject] in [timeframe]. Can you create a step-by-step learning plan with specific tasks, resources, and milestones?",
                    category: "Education",
                    chatType: "learning_journey",
                    estimatedTime: "10-15 min chat"
                }
            ],
            project_management: [
                {
                    id: 'project_health_check',
                    title: "Project Health Check",
                    description: "Review and optimize an ongoing project",
                    prompt: "I have an ongoing project that's [describe current status and challenges]. Can you help me analyze what needs attention and create action items?",
                    category: "Work",
                    chatType: "project_management",
                    estimatedTime: "10-15 min chat"
                },
                {
                    id: 'team_task_distribution',
                    title: "Team Task Distribution",
                    description: "Organize and assign tasks effectively across team members",
                    prompt: "I need to distribute tasks among my team of [team size] for [project type]. Help me organize tasks, assign responsibilities, and set deadlines effectively.",
                    category: "Work",
                    chatType: "team_collaboration",
                    estimatedTime: "15-20 min chat"
                },
                {
                    id: 'risk_assessment',
                    title: "Risk Assessment & Mitigation",
                    description: "Identify potential project risks and create mitigation plans",
                    prompt: "My project involves [brief project description]. Help me identify potential risks, assess their impact, and create mitigation strategies.",
                    category: "Work",
                    chatType: "risk_assessment",
                    estimatedTime: "15-20 min chat"
                }
            ],
            general: [
                {
                    id: 'productivity_system',
                    title: "Productivity System Setup",
                    description: "Design a personal productivity system that works for you",
                    prompt: "I want to improve my productivity and time management. Can you help me design a system that works with my lifestyle and creates actionable daily tasks?",
                    category: "Personal",
                    chatType: "productivity_planning",
                    estimatedTime: "15-20 min chat"
                },
                {
                    id: 'career_development',
                    title: "Career Development Plan",
                    description: "Create a strategic plan for your career advancement",
                    prompt: "I want to advance in my career as a [your role] in [industry]. Help me create a development plan with specific actions, skills to learn, and timelines.",
                    category: "Work",
                    chatType: "career_development",
                    estimatedTime: "20-25 min chat"
                },
                {
                    id: 'side_project_brainstorm',
                    title: "Side Project Brainstorm",
                    description: "Explore and plan your next side project or business idea",
                    prompt: "I'm interested in starting a side project in [your area of interest]. Help me brainstorm viable ideas, validate them, and create an action plan.",
                    category: "Business",
                    chatType: "business_strategy",
                    estimatedTime: "15-20 min chat"
                }
            ]
        };

        // Personalize suggestions based on user's history
        let personalizedSuggestions = [];

        if (recentProjects.length > 0) {
            const recentCategories = [...new Set(recentProjects.map(p => p.category))];
            personalizedSuggestions.push({
                id: 'follow_up_projects',
                title: "Follow-up on Recent Projects",
                description: `Continue work on your ${recentCategories.join(' and ')} projects`,
                prompt: `I want to review and add more tasks to my recent ${recentCategories[0]} project. Can you help me identify what might be missing or what's next?`,
                category: recentCategories[0] || "Work",
                chatType: "project_management",
                estimatedTime: "5-10 min chat",
                isPersonalized: true
            });
        }

        if (recentChats.length > 0) {
            const commonChatType = recentChats[0].type;
            if (commonChatType !== 'general') {
                personalizedSuggestions.push({
                    id: 'continue_previous_work',
                    title: "Continue Previous Work",
                    description: `Build on your recent ${commonChatType.replace('_', ' ')} discussions`,
                    prompt: `I want to continue working on ${commonChatType.replace('_', ' ')} topics we discussed earlier. Can you help me expand or refine those ideas?`,
                    category: "Work",
                    chatType: commonChatType,
                    estimatedTime: "10-15 min chat",
                    isPersonalized: true
                });
            }
        }

        // Get suggestions for each category
        const suggestions = {
            trending: [
                ...personalizedSuggestions,
                ...baseSuggestions.project_creation.slice(0, 2),
                ...baseSuggestions.general.slice(0, 1)
            ],
            project_creation: baseSuggestions.project_creation,
            task_generation: baseSuggestions.task_generation,
            project_management: baseSuggestions.project_management,
            general: baseSuggestions.general
        };

        // Quick start prompts
        const quickStarts = [
            "I have a project idea but don't know where to start...",
            "Help me plan my next 30 days",
            "I'm feeling overwhelmed with my to-do list",
            "Create a learning plan for a new skill",
            "I need to organize a team project"
        ];

        res.json({
            success: true,
            data: {
                suggestions,
                quickStarts,
                categories: [
                    { key: 'trending', label: 'Trending', icon: '🔥' },
                    { key: 'project_creation', label: 'New Projects', icon: '🚀' },
                    { key: 'task_generation', label: 'Task Planning', icon: '📝' },
                    { key: 'project_management', label: 'Project Management', icon: '📊' },
                    { key: 'general', label: 'General Planning', icon: '💡' }
                ],
                stats: {
                    totalChats: recentChats.length,
                    recentProjects: recentProjects.length,
                    hasPersonalized: personalizedSuggestions.length > 0
                }
            }
        });

    } catch (error) {
        console.error('Error fetching chat suggestions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chat suggestions'
        });
    }
});

// Create chat with suggestion - FIXED
const createChatWithSuggestion = asyncHandler(async (req, res) => {
    const { suggestionId, customTitle, chatType = 'general', autoStart, category = 'Other' } = req.body;

    try {
        // Validate chatType against enum values
        const validChatTypes = [
            'general', 'project_creation', 'task_generation', 'project_management',
            'learning_journey', 'productivity_planning', 'career_development',
            'goal_setting', 'time_management', 'team_collaboration', 'risk_assessment',
            'marketing_campaign', 'event_planning', 'business_strategy', 'personal_development'
        ];

        const finalChatType = validChatTypes.includes(chatType) ? chatType : 'general';

        // Create the chat with proper validation
        const chat = await Chat.create({
            title: customTitle || 'New Chat',
            type: finalChatType,
            category: category,
            userId: req.user.id,
            createdFromSuggestion: !!suggestionId,
            suggestionId: suggestionId || null
        });

        // If autoStart is enabled, create initial message
        let initialMessage = null;
        if (autoStart) {
            let welcomeMessage;
            if (finalChatType === 'project_creation') {
                // Use AI welcome message for project creation
                const welcomeObj = aiService.getWelcomeMessage();
                welcomeMessage = welcomeObj.message;
            } else {
                // Fallback to previous logic for other types
                const welcomeMessages = {
                    // ...existing welcomeMessages...
                };
                welcomeMessage = welcomeMessages[finalChatType] || welcomeMessages.default;
            }

            initialMessage = await Message.create({
                chatId: chat._id,
                content: welcomeMessage,
                sender: 'assistant',
                userId: null,
                type: 'system'
            });

            await Chat.findByIdAndUpdate(chat._id, {
                lastMessage: initialMessage._id
            });
        }

        res.status(201).json({
            success: true,
            message: 'Chat created successfully',
            data: {
                chat,
                initialMessage,
                redirect: `/chats/${chat._id}`
            }
        });

    } catch (error) {
        console.error('Error creating chat with suggestion:', error);

        // Provide helpful error message
        let errorMessage = 'Failed to create chat';
        if (error.name === 'ValidationError') {
            if (error.errors.type) {
                errorMessage = `Invalid chat type: ${chatType}. Please use a valid chat type.`;
            } else if (error.errors.category) {
                errorMessage = `Invalid category: ${category}. Please use a valid category.`;
            }
        }

        res.status(400).json({
            success: false,
            message: errorMessage,
            debug: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Rest of the controller methods remain the same...
const getChats = asyncHandler(async (req, res) => {
    const chats = await Chat.find({ userId: req.user.id })
        .sort({ updatedAt: -1 })
        .populate('lastMessage');

    res.json({
        success: true,
        data: chats
    });
});

const getChat = asyncHandler(async (req, res) => {
    const { chatId } = req.params;

    const chat = await Chat.findOne({
        _id: chatId,
        userId: req.user.id
    });

    if (!chat) {
        return res.status(404).json({
            success: false,
            message: 'Chat not found'
        });
    }

    const messages = await Message.find({ chatId })
        .sort({ createdAt: 1 });

    res.json({
        success: true,
        data: {
            chat,
            messages
        }
    });
});

const createChat = asyncHandler(async (req, res) => {
    const { title = 'New Chat', type = 'general', category = 'Other' } = req.body;

    const chat = await Chat.create({
        title,
        type,
        category,
        userId: req.user.id
    });

    res.status(201).json({
        success: true,
        data: chat
    });
});

const sendMessage = asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({
            success: false,
            message: 'Message content is required'
        });
    }

    const chat = await Chat.findOne({
        _id: chatId,
        userId: req.user.id
    });

    if (!chat) {
        return res.status(404).json({
            success: false,
            message: 'Chat not found'
        });
    }

    try {
        const user = await User.findById(req.user.id).select('avatar');

        const userMessage = await Message.create({
            chatId,
            content: content.trim(),
            sender: 'user',
            userId: req.user.id,
            avatar: user?.avatar // Add avatar field
        });

        const recentMessages = await Message.find({ chatId })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('content sender');

        const context = {
            chatId,
            userId: req.user.id,
            chatType: chat.type,
            recentMessages: recentMessages.reverse()
        };

        const aiResponse = await aiChatService.generateChatResponse(content, context, req.user.id);

        const assistantMessage = await Message.create({
            chatId,
            content: aiResponse.message,
            sender: 'assistant',
            userId: null,
            avatar: null // Or set a default assistant avatar if you have one
        });

        const updateData = {
            lastMessage: assistantMessage._id,
            updatedAt: new Date()
        };

        if (chat.type === 'general' && aiResponse.suggestedType) {
            updateData.type = aiResponse.suggestedType;
        }

        await Chat.findByIdAndUpdate(chatId, updateData);

        res.json({
            success: true,
            data: {
                userMessage,
                assistantMessage,
                chatTypeUpdated: updateData.type !== chat.type
            }
        });

    } catch (error) {
        console.error('Chat message error:', error);

        const errorMessage = await Message.create({
            chatId,
            content: "I'm sorry, I encountered an error processing your request. Please try again.",
            sender: 'assistant',
            userId: null
        });

        res.status(500).json({
            success: false,
            message: 'Failed to process message',
            data: { assistantMessage: errorMessage }
        });
    }
});
const createProjectFromChat = asyncHandler(async (req, res) => {
    const { chatId } = req.params;

    const chat = await Chat.findOne({
        _id: chatId,
        userId: req.user.id
    });

    if (!chat) {
        return res.status(404).json({
            success: false,
            message: 'Chat not found'
        });
    }

    try {
        const messages = await Message.find({ chatId })
            .sort({ createdAt: 1 })
            .select('content sender');

        const conversationText = messages
            .map(msg => `${msg.sender}: ${msg.content}`)
            .join('\n');

        const projectResponse = await aiChatService.generateEnhancedChatResponse(
            `Based on our conversation, please create a project with tasks:\n\n${conversationText}`,
            { chatId, userId: req.user.id }
        );

        if (projectResponse.type !== 'project_creation') {
            return res.status(400).json({
                success: false,
                message: 'Unable to extract project information from the conversation. Please provide more specific project details in your chat.'
            });
        }

        // Validation fixes for project data
        const projectData = projectResponse.projectData;

        // Handle name/title field compatibility
        const projectName = projectData.name || projectData.title || "New Project";

        // Date validation - ensure dates are valid and in correct format
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format

        // Validate and fix startDate
        let startDate = projectData.startDate;
        if (!startDate || new Date(startDate) < today) {
            startDate = todayStr;
        }

        // Validate and fix dueDate
        let dueDate = projectData.dueDate;
        const timeline = projectData.timeline || 30;
        if (!dueDate || new Date(dueDate) <= new Date(startDate)) {
            const calculatedDueDate = new Date(startDate);
            calculatedDueDate.setDate(calculatedDueDate.getDate() + timeline);
            dueDate = calculatedDueDate.toISOString().split('T')[0];
        }

        // Create project with validated data
        const project = await Project.create({
            name: projectName, // Use the validated name
            description: projectData.description || "Project description to be refined",
            timeline: timeline,
            startDate: startDate,
            dueDate: dueDate,
            dueTime: projectData.dueTime || '17:00',
            priority: projectData.priority || 'Medium',
            category: projectData.category || 'General',
            tags: Array.isArray(projectData.tags) ? projectData.tags : [],
            userId: req.user.id,
            status: 'Pending',
            createdFromChat: chatId
        });

        let subtasks = [];
        if (projectResponse.subtasks && Array.isArray(projectResponse.subtasks) && projectResponse.subtasks.length > 0) {
            const subtaskData = projectResponse.subtasks.map((task, index) => {
                // Validate subtask data
                const subtaskStartDate = task.startDate && new Date(task.startDate) >= new Date(startDate)
                    ? task.startDate
                    : startDate;

                const subtaskDueDate = task.dueDate && new Date(task.dueDate) <= new Date(dueDate)
                    ? task.dueDate
                    : dueDate;

                return {
                    projectId: project._id,
                    title: task.title || `Task ${index + 1}`,
                    description: task.description || '',
                    order: task.order || (index + 1),
                    priority: task.priority || 'Medium',
                    estimatedHours: Math.max(0.5, parseFloat(task.estimatedHours) || 2), // Clamp to 0.5 minimum
                    status: 'Pending',
                    aiGenerated: true,
                    phase: task.phase || 'Execution',
                    startDate: subtaskStartDate,
                    dueDate: subtaskDueDate,
                    userId: req.user.id
                };
            });

            subtasks = await Subtask.insertMany(subtaskData);
        }

        // Create success message with proper project name
        await Message.create({
            chatId,
            content: `🎉 Project "${project.name}" created successfully with ${subtasks.length} tasks! You can view it in your projects dashboard.`,
            sender: 'assistant',
            userId: null,
            metadata: {
                projectId: project._id,
                action: 'project_created'
            }
        });

        res.status(201).json({
            success: true,
            message: 'Project created successfully from chat',
            data: {
                project,
                subtasks,
                subtasksCount: subtasks.length
            }
        });
    } catch (error) {
        // Handle AI service overload (503) gracefully
        if (error.status === 503 || error.statusCode === 503) {
            await Message.create({
                chatId,
                content: "The AI service is currently overloaded. Please try again in a few minutes.",
                sender: 'assistant',
                userId: null
            });
            return res.status(503).json({
                success: false,
                message: 'The AI service is currently overloaded. Please try again in a few minutes.'
            });
        }
        if (error.status === 429) {
            await Message.create({
                chatId,
                content: "You have reached the daily limit for AI requests. Please try again tomorrow or upgrade your plan.",
                sender: 'assistant',
                userId: null
            });
            return res.status(429).json({
                success: false,
                message: 'You have reached the daily limit for AI requests. Please try again tomorrow or upgrade your plan.'
            });
        }
        console.error('Project creation from chat error:', error);

        await Message.create({
            chatId,
            content: "I encountered an error while creating your project. Please ensure your conversation contains clear project details and try again.",
            sender: 'assistant',
            userId: null
        });

        res.status(500).json({
            success: false,
            message: 'Failed to create project from chat',
            error: error.message
        });
    }
});

// Helper methods for the controller
const formatProjectCreationResponse = (projectData, subtasksResponse) => {
    const taskCount = subtasksResponse.subtasks?.length || 0;
    const hours = subtasksResponse.totalEstimatedHours || 0;
    const projectName = projectData.name || projectData.title || "New Project";

    return `Great! I've analyzed your request and created a project plan for "${projectName}".

📋 **Project Overview:**
• **Timeline:** ${projectData.timeline} days
• **Priority:** ${projectData.priority}
• **Category:** ${projectData.category}

📝 **Generated Tasks:** ${taskCount} tasks
⏱️ **Estimated Time:** ${hours} hours

${taskCount > 0 ? '**Tasks include:**\n' + subtasksResponse.subtasks.slice(0, 3).map((task, i) => `${i + 1}. ${task.title}`).join('\n') : ''}
${taskCount > 3 ? `... and ${taskCount - 3} more tasks` : ''}

Would you like me to create this project for you? Click the "Create Project" button to add it to your dashboard with all the tasks ready to go!`;
};

const extractProjectData = async (message) => {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

    const extractionPrompt = `
Based on this user message, extract project information and provide smart defaults:

User message: "${message}"

Create a comprehensive project structure. If specific information is not provided, use intelligent defaults.

Respond with JSON only:
{
  "name": "clear project title",
  "description": "detailed project description", 
  "timeline": number_of_days,
  "startDate": "${todayStr}",
  "dueDate": "YYYY-MM-DD format (start date + timeline)",
  "dueTime": "17:00",
  "priority": "High|Medium|Low",
  "category": "Development|Marketing|Research|Planning|Personal|Business|Other",
  "tags": ["relevant", "tags"],
  "estimatedComplexity": "Low|Medium|High"
}`;

    try {
        const result = await this.model.generateContent(extractionPrompt);
        const response = result.response.text();
        const jsonMatch = response.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);

            // Handle both 'name' and 'title' fields for compatibility
            if (data.title && !data.name) {
                data.name = data.title;
            }
            if (!data.name && !data.title) {
                data.name = "New Project";
            }

            // Force set startDate to today
            data.startDate = todayStr;

            // Always recalculate dueDate to ensure it's in the future
            if (data.timeline && data.timeline > 0) {
                const dueDate = new Date(today);
                dueDate.setDate(dueDate.getDate() + data.timeline);
                data.dueDate = dueDate.getFullYear() + '-' +
                    String(dueDate.getMonth() + 1).padStart(2, '0') + '-' +
                    String(dueDate.getDate()).padStart(2, '0');
            } else {
                const dueDate = new Date(today);
                dueDate.setDate(dueDate.getDate() + 30);
                data.dueDate = dueDate.getFullYear() + '-' +
                    String(dueDate.getMonth() + 1).padStart(2, '0') + '-' +
                    String(dueDate.getDate()).padStart(2, '0');
                data.timeline = 30;
            }

            // Validate that tags is an array
            if (!Array.isArray(data.tags)) {
                data.tags = [];
            }

            console.log('✅ Project data extracted:', {
                name: data.name,
                startDate: data.startDate,
                dueDate: data.dueDate,
                timeline: data.timeline
            });

            return data;
        }
    } catch (error) {
        console.error('❌ Error extracting project data:', error);
    }

    // Fallback project data with correct field names
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.getFullYear() + '-' +
        String(dueDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(dueDate.getDate()).padStart(2, '0');

    return {
        name: "New Project", // Ensure 'name' field is always present
        description: "Project description to be refined",
        timeline: 30,
        startDate: todayStr,
        dueDate: dueDateStr,
        dueTime: "17:00",
        priority: "Medium",
        category: "General",
        tags: [],
        estimatedComplexity: "Medium"
    };
};

const deleteChat = asyncHandler(async (req, res) => {
    const { chatId } = req.params;

    const chat = await Chat.findOneAndDelete({
        _id: chatId,
        userId: req.user.id
    });

    if (!chat) {
        return res.status(404).json({
            success: false,
            message: 'Chat not found'
        });
    }

    await Message.deleteMany({ chatId });

    res.json({
        success: true,
        message: 'Chat deleted successfully'
    });
});

const updateChatTitle = asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({
            success: false,
            message: 'Title is required'
        });
    }

    const chat = await Chat.findOneAndUpdate(
        { _id: chatId, userId: req.user.id },
        { title: title.trim() },
        { new: true }
    );

    if (!chat) {
        return res.status(404).json({
            success: false,
            message: 'Chat not found'
        });
    }

    res.json({
        success: true,
        data: chat
    });
});

module.exports = {
    getChats,
    getChat,
    createChat,
    createChatWithSuggestion,
    sendMessage,
    createProjectFromChat,
    formatProjectCreationResponse,
    extractProjectData,
    deleteChat,
    updateChatTitle,
    getChatSuggestions
};