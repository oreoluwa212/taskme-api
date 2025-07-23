// src/controllers/chatController.js
const asyncHandler = require('express-async-handler');
const aiChatService = require('../services/aiChatService');
const aiService = require('../services/aiService');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Project = require('../models/Project');
const Subtask = require('../models/Subtask');

// Constants
const VALID_CHAT_TYPES = [
    'general', 'project_creation', 'task_generation', 'project_management',
    'learning_journey', 'productivity_planning', 'career_development',
    'goal_setting', 'time_management', 'team_collaboration', 'risk_assessment',
    'marketing_campaign', 'event_planning', 'business_strategy', 'personal_development'
];

const WELCOME_MESSAGES = {
    general: "Hello! How can I assist you today?",
    task_generation: "Welcome! I'm here to help you generate and organize tasks. What project or goal are you working on?",
    project_management: "Hi! I'm ready to help you manage your project effectively. What's your current project status?",
    learning_journey: "Welcome to your learning journey! What new skills or topics would you like to explore?",
    productivity_planning: "Hello! Let's boost your productivity. What areas would you like to focus on?",
    career_development: "Welcome! I'm here to support your career growth. What are your professional goals?",
    goal_setting: "Hi! Ready to set and achieve your goals? What would you like to accomplish?",
    time_management: "Welcome! Let's optimize your time management. What challenges are you facing?",
    team_collaboration: "Hello! I'm here to enhance your team collaboration. How can we improve teamwork?",
    risk_assessment: "Welcome! Let's identify and assess potential risks. What project or situation should we analyze?",
    marketing_campaign: "Hi! Ready to create an effective marketing campaign? What's your product or service?",
    event_planning: "Welcome! I'll help you plan a successful event. What type of event are you organizing?",
    business_strategy: "Hello! Let's develop your business strategy. What are your key objectives?",
    personal_development: "Welcome to your personal development journey! What aspects of yourself would you like to improve?"
};

const BASE_SUGGESTIONS = {
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

// Utility functions
const validateChatType = (chatType) => {
    return VALID_CHAT_TYPES.includes(chatType) ? chatType : 'general';
};

const getWelcomeMessage = async (chatType) => {
    if (chatType === 'project_creation') {
        try {
            const welcomeObj = aiService.getWelcomeMessage();
            return welcomeObj.message;
        } catch (error) {
            console.error('Error getting AI welcome message:', error);
            return "Welcome! I'm here to help you create and manage your project. What would you like to work on today?";
        }
    }
    return WELCOME_MESSAGES[chatType] || WELCOME_MESSAGES.general;
};

const generatePersonalizedSuggestions = (recentProjects, recentChats) => {
    const personalizedSuggestions = [];

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

    return personalizedSuggestions;
};

const handleError = (error, chatId = null) => {
    console.error('Chat controller error:', error);
    
    const errorHandlers = {
        ValidationError: (err) => {
            if (err.errors.type) return `Invalid chat type. Please use a valid chat type.`;
            if (err.errors.category) return `Invalid category. Please use a valid category.`;
            const firstError = Object.values(err.errors)[0];
            return firstError.message || 'Validation failed';
        },
        CastError: () => 'Invalid data format provided',
        11000: () => 'A chat with similar details already exists'
    };

    const handler = errorHandlers[error.name] || errorHandlers[error.code];
    return handler ? handler(error) : 'An unexpected error occurred';
};

// Controller methods
const getChatSuggestions = asyncHandler(async (req, res) => {
    try {
        const [recentChats, recentProjects] = await Promise.all([
            Chat.find({ userId: req.user.id })
                .sort({ updatedAt: -1 })
                .limit(3)
                .select('type title category'),
            Project.find({ userId: req.user.id })
                .sort({ createdAt: -1 })
                .limit(2)
                .select('name category')
        ]);

        const personalizedSuggestions = generatePersonalizedSuggestions(recentProjects, recentChats);

        const suggestions = {
            trending: [
                ...personalizedSuggestions,
                ...BASE_SUGGESTIONS.project_creation.slice(0, 2),
                ...BASE_SUGGESTIONS.general.slice(0, 1)
            ],
            project_creation: BASE_SUGGESTIONS.project_creation,
            task_generation: BASE_SUGGESTIONS.task_generation,
            project_management: BASE_SUGGESTIONS.project_management,
            general: BASE_SUGGESTIONS.general
        };

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
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chat suggestions'
        });
    }
});

const createChatWithSuggestion = asyncHandler(async (req, res) => {
    const { suggestionId, customTitle, chatType = 'general', autoStart, category = 'Other' } = req.body;

    try {
        const validatedChatType = validateChatType(chatType);

        const chat = await Chat.create({
            title: customTitle || 'New Chat',
            type: validatedChatType,
            category: category,
            userId: req.user.id,
            createdFromSuggestion: !!suggestionId,
            suggestionId: suggestionId || null
        });

        let initialMessage = null;
        if (autoStart) {
            const welcomeMessage = await getWelcomeMessage(validatedChatType);

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
        const errorMessage = handleError(error);
        res.status(400).json({
            success: false,
            message: errorMessage
        });
    }
});

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
        type: validateChatType(type),
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

    if (!content?.trim()) {
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
            avatar: user?.avatar
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
            avatar: null
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

const validateProjectData = (projectData) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const projectName = projectData.name || projectData.title || "New Project";
    const timeline = Math.max(1, parseInt(projectData.timeline) || 30);
    
    let startDate = projectData.startDate;
    if (!startDate || new Date(startDate) <= today) {
        startDate = tomorrowStr;
    }
    
    let dueDate = projectData.dueDate;
    if (!dueDate || new Date(dueDate) <= new Date(startDate)) {
        const calculatedDueDate = new Date(startDate);
        calculatedDueDate.setDate(calculatedDueDate.getDate() + timeline);
        dueDate = calculatedDueDate.toISOString().split('T')[0];
    }
    
    return {
        name: projectName,
        description: projectData.description || "Project description to be refined",
        timeline,
        startDate,
        dueDate,
        dueTime: projectData.dueTime || '17:00',
        priority: projectData.priority || 'Medium',
        category: projectData.category || 'General',
        tags: Array.isArray(projectData.tags) ? projectData.tags : []
    };
};

const createSubtasks = async (projectId, subtasksData, projectStartDate, projectDueDate, userId) => {
    if (!subtasksData || !Array.isArray(subtasksData) || subtasksData.length === 0) {
        return [];
    }

    const subtaskData = subtasksData.map((task, index) => {
        const subtaskStartDate = task.startDate && new Date(task.startDate) >= new Date(projectStartDate)
            ? task.startDate
            : projectStartDate;

        const subtaskDueDate = task.dueDate && new Date(task.dueDate) <= new Date(projectDueDate)
            ? task.dueDate
            : projectDueDate;

        return {
            projectId,
            title: task.title || `Task ${index + 1}`,
            description: task.description || '',
            order: task.order || (index + 1),
            priority: task.priority || 'Medium',
            estimatedHours: Math.max(0.5, parseFloat(task.estimatedHours) || 2),
            status: 'Pending',
            aiGenerated: true,
            phase: task.phase || 'Execution',
            startDate: subtaskStartDate,
            dueDate: subtaskDueDate,
            userId
        };
    });

    return await Subtask.insertMany(subtaskData);
};

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

        const validatedProjectData = validateProjectData(projectResponse.projectData);

        const project = await Project.create({
            ...validatedProjectData,
            userId: req.user.id,
            status: 'Pending',
            createdFromChat: chatId
        });

        const subtasks = await createSubtasks(
            project._id,
            projectResponse.subtasks,
            validatedProjectData.startDate,
            validatedProjectData.dueDate,
            req.user.id
        );

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
        let errorMessage = "I encountered an error while creating your project. Please ensure your conversation contains clear project details and try again.";
        let statusCode = 500;

        if (error.status === 503 || error.statusCode === 503) {
            errorMessage = "The AI service is currently overloaded. Please try again in a few minutes.";
            statusCode = 503;
        } else if (error.status === 429) {
            errorMessage = "You have reached the daily limit for AI requests. Please try again tomorrow or upgrade your plan.";
            statusCode = 429;
        }

        await Message.create({
            chatId,
            content: errorMessage,
            sender: 'assistant',
            userId: null
        });

        res.status(statusCode).json({
            success: false,
            message: errorMessage
        });
    }
});

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

    if (!title?.trim()) {
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
    deleteChat,
    updateChatTitle,
    getChatSuggestions
};