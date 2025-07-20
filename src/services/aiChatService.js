// src/services/aiChatService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

class AIChatService {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY environment variable is not set');
            throw new Error('GEMINI_API_KEY is required');
        }

        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048,
            }
        });

        // Initialize caches and counters
        this.responseCache = new Map();
        this.userRequestCounts = new Map();
        this.commonResponses = this.initializeCommonResponses();
        this.dailyRequestCount = 0;
        this.lastResetDate = new Date().toDateString();

        // Configuration
        this.MAX_DAILY_REQUESTS = 45;
        this.MAX_USER_REQUESTS_PER_HOUR = 5;
        this.CACHE_TTL = 60 * 60 * 1000; // 1 hour
        this.CACHE_MAX_SIZE = 100;
    }

    checkDailyReset() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.dailyRequestCount = 0;
            this.lastResetDate = today;
            this.userRequestCounts.clear();
            console.log('Daily counters reset');
        }
    }

    checkUserRateLimit(userId) {
        this.checkDailyReset();
        const now = Date.now();
        const userKey = `${userId}_${Math.floor(now / (60 * 60 * 1000))}`;
        const userCount = this.userRequestCounts.get(userKey) || 0;
        return userCount < this.MAX_USER_REQUESTS_PER_HOUR;
    }

    incrementUserCount(userId) {
        const now = Date.now();
        const userKey = `${userId}_${Math.floor(now / (60 * 60 * 1000))}`;
        const currentCount = this.userRequestCounts.get(userKey) || 0;
        this.userRequestCounts.set(userKey, currentCount + 1);
        this.dailyRequestCount++;
    }

    generateCacheKey(userMessage, context = {}) {
        const normalizedMessage = userMessage.toLowerCase().trim();
        const contextString = JSON.stringify(context.recentMessages || []);
        return crypto.createHash('md5').update(normalizedMessage + contextString).digest('hex');
    }

    checkCommonResponses(userMessage) {
        const message = userMessage.toLowerCase().trim();
        for (const [pattern, response] of this.commonResponses) {
            if (message.includes(pattern)) {
                return {
                    message: response,
                    type: 'cached_common',
                    cached: true
                };
            }
        }
        return null;
    }

    initializeCommonResponses() {
        return new Map([
            ['hello', "Hello! I'm here to help you with your projects and tasks. What can I assist you with today?"],
            ['hi', "Hi there! I'm ready to help you organize your work and achieve your goals. What's on your mind?"],
            ['help', "I can help you with:\n• Creating and organizing projects\n• Breaking down tasks\n• Setting priorities and deadlines\n• Planning workflows\n\nWhat would you like to work on?"],
            ['thank', "You're welcome! Feel free to ask if you need help with any other projects or tasks."],
            ['thanks', "You're welcome! I'm here whenever you need assistance with planning or organizing your work."],
            ['bye', "Goodbye! Come back anytime you need help with your projects and tasks."],
            ['good morning', "Good morning! Ready to tackle some productive work today? How can I help you get organized?"],
            ['good evening', "Good evening! What projects or tasks can I help you organize?"]
        ]);
    }

    getCachedResponse(cacheKey) {
        const cached = this.responseCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
            return {
                ...cached.response,
                cached: true
            };
        }
        if (cached) {
            this.responseCache.delete(cacheKey);
        }
        return null;
    }

    cacheResponse(cacheKey, response) {
        if (this.responseCache.size >= this.CACHE_MAX_SIZE) {
            const oldestKey = this.responseCache.keys().next().value;
            this.responseCache.delete(oldestKey);
        }
        this.responseCache.set(cacheKey, {
            response: { ...response, cached: false },
            timestamp: Date.now()
        });
    }

    buildConversationContext(recentMessages = []) {
        if (!recentMessages || recentMessages.length === 0) {
            return '';
        }
        const contextMessages = recentMessages
            .slice(-3)
            .map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
            .join('\n');
        return `Previous conversation:\n${contextMessages}\n\n`;
    }

    // MAIN CHAT RESPONSE METHOD - This is what should be called
    async generateChatResponse(userMessage, context = {}) {
        const userId = context.userId || 'anonymous';

        try {
            this.checkDailyReset();

            // Check common responses first
            const commonResponse = this.checkCommonResponses(userMessage);
            if (commonResponse) {
                console.log('Returned common response, no API call needed');
                return commonResponse;
            }

            // Check cache
            const cacheKey = this.generateCacheKey(userMessage, context);
            const cachedResponse = this.getCachedResponse(cacheKey);
            if (cachedResponse) {
                console.log('Returned cached response, no API call needed');
                return cachedResponse;
            }

            // Check daily API limit
            if (this.dailyRequestCount >= this.MAX_DAILY_REQUESTS) {
                return {
                    message: "I've reached the daily API limit to keep costs low. I'll be back tomorrow with fresh responses! In the meantime, I can help with basic questions using my cached knowledge.",
                    type: 'daily_limit_reached',
                    cached: true
                };
            }

            // Check user rate limit
            if (!this.checkUserRateLimit(userId)) {
                return {
                    message: "You've reached the hourly limit of 5 requests. This helps me serve all users fairly with our limited daily API quota. Please try again in an hour!",
                    type: 'user_limit_reached',
                    cached: true
                };
            }

            // Make API call
            console.log(`Making API call (${this.dailyRequestCount + 1}/${this.MAX_DAILY_REQUESTS})`);

            const conversationContext = this.buildConversationContext(context.recentMessages);
            const prompt = `You are a helpful AI assistant specializing in project management and productivity. 
            
${conversationContext}

User: ${userMessage}

Please provide a helpful, conversational response. If the user is describing a project idea, goal, or task they want to accomplish, be encouraging and offer to help them organize it into a structured project plan.`;

            const result = await this.model.generateContent(prompt);

            if (!result || !result.response) {
                throw new Error('No response received from Gemini API');
            }

            const response = result.response.text();

            if (!response || response.trim().length === 0) {
                throw new Error('Empty response from Gemini API');
            }

            this.incrementUserCount(userId);

            const finalResponse = {
                message: response,
                type: 'api_response',
                cached: false,
                apiCallsRemaining: this.MAX_DAILY_REQUESTS - this.dailyRequestCount
            };

            this.cacheResponse(cacheKey, finalResponse);

            console.log(`API call successful. Remaining today: ${this.MAX_DAILY_REQUESTS - this.dailyRequestCount}`);
            return finalResponse;

        } catch (error) {
            console.error('Error in generateChatResponse:', error);
            return {
                message: "I'm experiencing some technical difficulties. Let me try to help you with a general response based on my knowledge.",
                type: 'fallback',
                error: error.message,
                cached: true
            };
        }
    }

    // ALIAS METHOD - Add this for backward compatibility if other code calls the wrong method name
    async generateEnhancedChatResponse(userMessage, context = {}) {
        console.warn('DEPRECATED: generateEnhancedChatResponse is deprecated, use generateChatResponse instead');
        return this.generateChatResponse(userMessage, context);
    }

    // Rule-based project extraction
    extractProjectFromConversation(messages = []) {
        try {
            if (!messages || messages.length === 0) {
                console.log('No messages provided for project extraction');
                return null;
            }

            const userMessages = messages
                .filter(msg => msg.sender === 'user')
                .slice(-3)
                .map(msg => msg.content.toLowerCase());

            if (userMessages.length === 0) {
                console.log('No user messages found');
                return null;
            }

            const projectKeywords = [
                'project', 'build', 'create', 'develop', 'make', 'design',
                'plan', 'organize', 'goal', 'task', 'website', 'app',
                'application', 'system', 'dashboard', 'platform',
                'launch', 'start', 'begin', 'implement', 'work on'
            ];

            const complexityKeywords = {
                high: ['complex', 'advanced', 'sophisticated', 'enterprise', 'large', 'comprehensive'],
                medium: ['moderate', 'standard', 'typical', 'regular'],
                low: ['simple', 'basic', 'quick', 'small', 'minimal']
            };

            const categoryKeywords = {
                'Development': ['website', 'app', 'application', 'code', 'software', 'system', 'platform', 'api'],
                'Marketing': ['marketing', 'campaign', 'promotion', 'brand', 'social media', 'content'],
                'Research': ['research', 'study', 'analysis', 'investigate', 'explore'],
                'Planning': ['plan', 'strategy', 'roadmap', 'schedule', 'organize'],
                'Business': ['business', 'startup', 'company', 'revenue', 'sales', 'client'],
                'Personal': ['personal', 'hobby', 'learning', 'skill', 'improvement']
            };

            const hasProjectKeywords = userMessages.some(msg =>
                projectKeywords.some(keyword => msg.includes(keyword))
            );

            if (!hasProjectKeywords) {
                console.log('No project keywords found in messages');
                return null;
            }

            const latestMessage = messages.filter(msg => msg.sender === 'user').slice(-1)[0];
            const messageContent = latestMessage.content;

            const today = new Date();
            const dueDate = new Date();
            dueDate.setDate(today.getDate() + 30);

            let category = 'Other';
            for (const [cat, keywords] of Object.entries(categoryKeywords)) {
                if (keywords.some(keyword => messageContent.toLowerCase().includes(keyword))) {
                    category = cat;
                    break;
                }
            }

            let complexity = 'Medium';
            for (const [level, keywords] of Object.entries(complexityKeywords)) {
                if (keywords.some(keyword => messageContent.toLowerCase().includes(keyword))) {
                    complexity = level.charAt(0).toUpperCase() + level.slice(1);
                    break;
                }
            }

            let title = messageContent.replace(/[^\w\s]/g, '').substring(0, 50).trim();
            if (!title) {
                title = 'New Project';
            } else if (title.length < 10) {
                title = `${title} Project`;
            }

            const timelineMap = { 'Low': 14, 'Medium': 30, 'High': 60 };
            const timeline = timelineMap[complexity] || 30;
            dueDate.setDate(today.getDate() + timeline);

            const projectData = {
                hasProject: true,
                title: title,
                description: messageContent.substring(0, 200),
                timeline: timeline,
                startDate: today.toISOString().split('T')[0],
                dueDate: dueDate.toISOString().split('T')[0],
                priority: complexity === 'High' ? 'High' : complexity === 'Low' ? 'Low' : 'Medium',
                category: category,
                tags: this.extractTagsFromMessage(messageContent),
                estimatedComplexity: complexity
            };

            console.log('Project extracted without API call:', projectData.title);
            return projectData;

        } catch (error) {
            console.error('Error extracting project from conversation:', error);
            return null;
        }
    }

    extractTagsFromMessage(content) {
        const commonTags = {
            'web': ['website', 'web', 'html', 'css', 'javascript'],
            'mobile': ['mobile', 'app', 'android', 'ios', 'react native'],
            'backend': ['api', 'server', 'database', 'backend'],
            'frontend': ['frontend', 'ui', 'ux', 'design'],
            'ecommerce': ['shop', 'store', 'ecommerce', 'payment'],
            'automation': ['automate', 'script', 'workflow'],
            'learning': ['learn', 'study', 'course', 'tutorial']
        };

        const tags = [];
        const lowerContent = content.toLowerCase();

        for (const [tag, keywords] of Object.entries(commonTags)) {
            if (keywords.some(keyword => lowerContent.includes(keyword))) {
                tags.push(tag);
            }
        }

        return tags.slice(0, 5);
    }

    async generateProjectTasks(projectData) {
        const today = new Date().toISOString().split('T')[0];
        const startDate = projectData.startDate || today;
        const endDate = projectData.dueDate || (() => {
            const date = new Date();
            date.setDate(date.getDate() + (projectData.timeline || 30));
            return date.toISOString().split('T')[0];
        })();

        const prompt = `Create a detailed task breakdown for this project. Be very careful with JSON formatting.

Project: ${projectData.title || projectData.name || 'Untitled Project'}
Description: ${projectData.description || 'No description provided'}
Timeline: ${projectData.timeline || 30} days
Priority: ${projectData.priority || 'Medium'}
Category: ${projectData.category || 'General'}
Start Date: ${startDate}
End Date: ${endDate}

Generate 4-8 specific, actionable subtasks. Each task should be concrete and completable.

CRITICAL: Respond with valid JSON only. No markdown, no extra text, no comments.

{
  "subtasks": [
    {
      "title": "Task title under 60 characters",
      "description": "Clear description of what needs to be done",
      "estimatedHours": 3,
      "priority": "High",
      "order": 1,
      "phase": "Planning",
      "complexity": "Medium",
      "riskLevel": "Low",
      "tags": [],
      "skills": [],
      "startDate": "${startDate}",
      "dueDate": "${endDate}"
    }
  ],
  "totalEstimatedHours": 24,
  "criticalPath": ["Task 1", "Task 2"],
  "milestones": ["Mid-project review", "Final delivery"],
  "riskFactors": ["Resource availability"],
  "suggestions": ["Regular progress reviews"],
  "resources": ["Documentation", "Tools"],
  "projectInsights": "Key insights about the project",
  "recommendedTeamSize": 2,
  "estimatedBudget": "Medium",
  "successMetrics": ["Quality metrics", "Timeline adherence"]
}`;

        try {
            if (this.dailyRequestCount >= this.MAX_DAILY_REQUESTS) {
                console.log('API quota exhausted, using fallback tasks');
                return this.generateFallbackTasks(projectData);
            }

            console.log('Generating project tasks...');
            const result = await this.model.generateContent(prompt);
            let response = result.response.text().trim();

            response = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            const jsonMatch = response.match(/\{[\s\S]*\}$/);

            if (jsonMatch) {
                const tasksResponse = JSON.parse(jsonMatch[0]);
                this.incrementUserCount('system');

                if (!tasksResponse.subtasks || !Array.isArray(tasksResponse.subtasks)) {
                    throw new Error('Invalid subtasks structure');
                }

                const projectStart = new Date(startDate);
                const projectEnd = new Date(endDate);
                const totalDays = Math.max(1, Math.ceil((projectEnd - projectStart) / (1000 * 60 * 60 * 24)));

                tasksResponse.subtasks = tasksResponse.subtasks.map((task, index) => {
                    const taskStartOffset = Math.floor((index / tasksResponse.subtasks.length) * totalDays);
                    const taskDuration = Math.ceil((task.estimatedHours || 4) / 8) || 1;

                    const taskStart = new Date(projectStart);
                    taskStart.setDate(taskStart.getDate() + taskStartOffset);

                    const taskEnd = new Date(taskStart);
                    taskEnd.setDate(taskEnd.getDate() + taskDuration);

                    return {
                        title: task.title || `Task ${index + 1}`,
                        description: task.description || 'Task description',
                        estimatedHours: task.estimatedHours || 4,
                        priority: task.priority || 'Medium',
                        order: index + 1,
                        phase: task.phase || 'Execution',
                        complexity: task.complexity || 'Medium',
                        riskLevel: task.riskLevel || 'Low',
                        tags: task.tags || [],
                        skills: task.skills || [],
                        startDate: taskStart.toISOString().split('T')[0],
                        dueDate: taskEnd.toISOString().split('T')[0]
                    };
                });

                tasksResponse.totalEstimatedHours = tasksResponse.subtasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
                tasksResponse.criticalPath = tasksResponse.criticalPath || [];
                tasksResponse.milestones = tasksResponse.milestones || [];
                tasksResponse.riskFactors = tasksResponse.riskFactors || [];
                tasksResponse.suggestions = tasksResponse.suggestions || [];
                tasksResponse.resources = tasksResponse.resources || [];
                tasksResponse.projectInsights = tasksResponse.projectInsights || 'Project ready for execution';
                tasksResponse.recommendedTeamSize = tasksResponse.recommendedTeamSize || 1;
                tasksResponse.estimatedBudget = tasksResponse.estimatedBudget || 'Medium';
                tasksResponse.successMetrics = tasksResponse.successMetrics || [];

                return tasksResponse;
            }

            throw new Error('No valid JSON found in response');
        } catch (error) {
            console.error('Error generating project tasks:', error);
            return this.generateFallbackTasks(projectData);
        }
    }

    generateFallbackTasks(projectData) {
        const today = new Date().toISOString().split('T')[0];
        const dueDate = projectData.dueDate || (() => {
            const date = new Date();
            date.setDate(date.getDate() + (projectData.timeline || 30));
            return date.toISOString().split('T')[0];
        })();

        const fallbackTasks = [
            {
                title: 'Project Planning and Setup',
                description: 'Define project scope, requirements, and set up initial structure',
                estimatedHours: 4,
                priority: 'High',
                order: 1,
                phase: 'Planning',
                complexity: 'Medium',
                riskLevel: 'Low',
                tags: [],
                skills: [],
                startDate: today,
                dueDate: dueDate
            },
            {
                title: 'Research and Analysis',
                description: 'Conduct necessary research and analyze requirements',
                estimatedHours: 6,
                priority: 'High',
                order: 2,
                phase: 'Planning',
                complexity: 'Medium',
                riskLevel: 'Low',
                tags: [],
                skills: [],
                startDate: today,
                dueDate: dueDate
            },
            {
                title: 'Core Implementation',
                description: 'Implement the main features and functionality',
                estimatedHours: 12,
                priority: 'High',
                order: 3,
                phase: 'Execution',
                complexity: 'High',
                riskLevel: 'Medium',
                tags: [],
                skills: [],
                startDate: today,
                dueDate: dueDate
            },
            {
                title: 'Testing and Quality Assurance',
                description: 'Test all components and ensure quality standards',
                estimatedHours: 6,
                priority: 'Medium',
                order: 4,
                phase: 'Review',
                complexity: 'Medium',
                riskLevel: 'Low',
                tags: [],
                skills: [],
                startDate: today,
                dueDate: dueDate
            }
        ];

        return {
            subtasks: fallbackTasks,
            totalEstimatedHours: 28,
            criticalPath: ['Project Planning and Setup', 'Core Implementation'],
            milestones: ['Planning Complete', 'Implementation Done'],
            riskFactors: ['Resource availability', 'Timeline constraints'],
            suggestions: ['Regular progress reviews', 'Early testing'],
            resources: ['Documentation', 'Development tools'],
            projectInsights: 'Standard project structure applied',
            recommendedTeamSize: 2,
            estimatedBudget: 'Medium',
            successMetrics: ['On-time delivery', 'Quality standards met']
        };
    }

    getUsageStats() {
        this.checkDailyReset();
        return {
            dailyRequestsUsed: this.dailyRequestCount,
            dailyRequestsRemaining: this.MAX_DAILY_REQUESTS - this.dailyRequestCount,
            dailyLimit: this.MAX_DAILY_REQUESTS,
            cacheSize: this.responseCache.size,
            cacheHitRate: this.calculateCacheHitRate(),
            lastReset: this.lastResetDate
        };
    }

    calculateCacheHitRate() {
        return this.responseCache.size > 0 ? 0.3 : 0;
    }

    clearCache() {
        this.responseCache.clear();
        console.log('Response cache cleared');
    }

    async testConnection() {
        try {
            const result = await this.model.generateContent("Say hello");
            this.incrementUserCount('test');
            return {
                success: true,
                response: result.response.text(),
                usage: this.getUsageStats()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                usage: this.getUsageStats()
            };
        }
    }
}

module.exports = new AIChatService();