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
        this.responseCache = new Map(); // In-memory cache for responses
        this.userRequestCounts = new Map(); // Track user requests
        this.commonResponses = this.initializeCommonResponses();
        this.dailyRequestCount = 0;
        this.lastResetDate = new Date().toDateString();

        // Configuration
        this.MAX_DAILY_REQUESTS = 45; // Leave 5 requests as buffer
        this.MAX_USER_REQUESTS_PER_HOUR = 5;
        this.CACHE_TTL = 60 * 60 * 1000; // 1 hour cache TTL
        this.CACHE_MAX_SIZE = 100; // Maximum cached responses
    }

    // Reset daily counters if new day
    checkDailyReset() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.dailyRequestCount = 0;
            this.lastResetDate = today;
            this.userRequestCounts.clear();
            console.log('Daily counters reset');
        }
    }

    // Check if user has exceeded rate limit
    checkUserRateLimit(userId) {
        this.checkDailyReset();

        const now = Date.now();
        const userKey = `${userId}_${Math.floor(now / (60 * 60 * 1000))}`; // Hour-based key
        const userCount = this.userRequestCounts.get(userKey) || 0;

        return userCount < this.MAX_USER_REQUESTS_PER_HOUR;
    }

    // Increment user request count
    incrementUserCount(userId) {
        const now = Date.now();
        const userKey = `${userId}_${Math.floor(now / (60 * 60 * 1000))}`;
        const currentCount = this.userRequestCounts.get(userKey) || 0;
        this.userRequestCounts.set(userKey, currentCount + 1);
        this.dailyRequestCount++;
    }

    // Generate cache key from user message
    generateCacheKey(userMessage, context = {}) {
        const normalizedMessage = userMessage.toLowerCase().trim();
        const contextString = JSON.stringify(context.recentMessages || []);
        return crypto.createHash('md5').update(normalizedMessage + contextString).digest('hex');
    }

    // Check common responses first (no API call needed)
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

    // Initialize common responses to avoid API calls
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

    // Check cache for similar responses
    getCachedResponse(cacheKey) {
        const cached = this.responseCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
            return {
                ...cached.response,
                cached: true
            };
        }

        // Remove expired cache entry
        if (cached) {
            this.responseCache.delete(cacheKey);
        }

        return null;
    }

    // Store response in cache
    cacheResponse(cacheKey, response) {
        // Implement LRU-like behavior by removing oldest entries
        if (this.responseCache.size >= this.CACHE_MAX_SIZE) {
            const oldestKey = this.responseCache.keys().next().value;
            this.responseCache.delete(oldestKey);
        }

        this.responseCache.set(cacheKey, {
            response: { ...response, cached: false },
            timestamp: Date.now()
        });
    }

    // Main optimized chat response method
    async generateChatResponse(userMessage, context = {}) {
        const userId = context.userId || 'anonymous';

        try {
            this.checkDailyReset();

            // 1. Check common responses first (no API call)
            const commonResponse = this.checkCommonResponses(userMessage);
            if (commonResponse) {
                console.log('Returned common response, no API call needed');
                return commonResponse;
            }

            // 2. Check cache
            const cacheKey = this.generateCacheKey(userMessage, context);
            const cachedResponse = this.getCachedResponse(cacheKey);
            if (cachedResponse) {
                console.log('Returned cached response, no API call needed');
                return cachedResponse;
            }

            // 3. Check daily API limit
            if (this.dailyRequestCount >= this.MAX_DAILY_REQUESTS) {
                return {
                    message: "I've reached the daily API limit to keep costs low. I'll be back tomorrow with fresh responses! In the meantime, I can help with basic questions using my cached knowledge.",
                    type: 'daily_limit_reached',
                    cached: true
                };
            }

            // 4. Check user rate limit
            if (!this.checkUserRateLimit(userId)) {
                return {
                    message: "You've reached the hourly limit of 5 requests. This helps me serve all users fairly with our limited daily API quota. Please try again in an hour!",
                    type: 'user_limit_reached',
                    cached: true
                };
            }

            // 5. Make API call
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

            // Increment counters
            this.incrementUserCount(userId);

            const finalResponse = {
                message: response,
                type: 'api_response',
                cached: false,
                apiCallsRemaining: this.MAX_DAILY_REQUESTS - this.dailyRequestCount
            };

            // Cache the response
            this.cacheResponse(cacheKey, finalResponse);

            console.log(`API call successful. Remaining today: ${this.MAX_DAILY_REQUESTS - this.dailyRequestCount}`);
            return finalResponse;

        } catch (error) {
            console.error('Error in generateChatResponse:', error);

            // Don't increment counter on API errors
            return {
                message: "I'm experiencing some technical difficulties. Let me try to help you with a general response based on my knowledge.",
                type: 'fallback',
                error: error.message,
                cached: true
            };
        }
    }

    // Batch processing for multiple requests
    async batchProcessRequests(requests) {
        const results = [];
        const apiRequests = [];

        // First pass: Check cache and common responses
        for (let i = 0; i < requests.length; i++) {
            const { userMessage, context } = requests[i];

            // Check common responses
            const commonResponse = this.checkCommonResponses(userMessage);
            if (commonResponse) {
                results[i] = commonResponse;
                continue;
            }

            // Check cache
            const cacheKey = this.generateCacheKey(userMessage, context);
            const cachedResponse = this.getCachedResponse(cacheKey);
            if (cachedResponse) {
                results[i] = cachedResponse;
                continue;
            }

            // Queue for API call
            apiRequests.push({ index: i, userMessage, context, cacheKey });
        }

        // Second pass: Process remaining requests with API calls
        const remainingQuota = this.MAX_DAILY_REQUESTS - this.dailyRequestCount;
        const requestsToProcess = Math.min(apiRequests.length, remainingQuota);

        for (let i = 0; i < requestsToProcess; i++) {
            const { index, userMessage, context, cacheKey } = apiRequests[i];
            try {
                const response = await this.generateChatResponse(userMessage, context);
                results[index] = response;
            } catch (error) {
                results[index] = {
                    message: "Error processing this request in batch.",
                    type: 'batch_error',
                    cached: true
                };
            }
        }

        // Handle remaining requests that couldn't be processed due to quota
        for (let i = requestsToProcess; i < apiRequests.length; i++) {
            const { index } = apiRequests[i];
            results[index] = {
                message: "Request queued due to daily quota limits. Please try again tomorrow.",
                type: 'quota_limited',
                cached: true
            };
        }

        return results;
    }

    // Enhanced chat response with project detection (optimized)
    async generateEnhancedChatResponse(userMessage, context = {}) {
        try {
            // First try regular optimized response
            const chatResponse = await this.generateChatResponse(userMessage, context);

            // Only do project analysis if we got a real API response (not cached/common)
            if (chatResponse.type === 'api_response' && this.dailyRequestCount < this.MAX_DAILY_REQUESTS - 2) {
                // We need at least 2 API calls remaining for project analysis + task generation
                const projectAnalysis = await this.analyzeForProjectCreation(userMessage);

                if (projectAnalysis.isProjectRequest && projectAnalysis.confidence > 0.7) {
                    const projectData = await this.extractProjectData(userMessage);
                    const subtasks = await this.generateProjectTasks(projectData);

                    return {
                        message: this.formatProjectCreationResponse(projectData, subtasks),
                        type: 'project_creation',
                        projectData,
                        subtasks: subtasks.subtasks,
                        metadata: {
                            totalTasks: subtasks.subtasks?.length || 0,
                            estimatedHours: subtasks.totalEstimatedHours || 0
                        }
                    };
                }
            }

            return chatResponse;

        } catch (error) {
            console.error('Error in generateEnhancedChatResponse:', error);
            return await this.generateChatResponse(userMessage, context);
        }
    }

    // Get usage statistics
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

    // Calculate cache hit rate (simplified)
    calculateCacheHitRate() {
        // This is a simplified calculation - you might want to implement proper metrics
        return this.responseCache.size > 0 ? 0.3 : 0; // Placeholder
    }

    // Clear cache manually
    clearCache() {
        this.responseCache.clear();
        console.log('Response cache cleared');
    }

    // The rest of your existing methods with minimal changes...
    async analyzeForProjectCreation(message) {
        // Only call if we have quota remaining
        if (this.dailyRequestCount >= this.MAX_DAILY_REQUESTS) {
            return { isProjectRequest: false, confidence: 0, reasoning: "Quota exhausted" };
        }

        const analysisPrompt = `
Analyze this message to determine if the user wants to create a project or accomplish a goal that could be organized as a project:

Message: "${message}"

Look for indicators like:
- Describing a goal or objective they want to achieve
- Mentioning work that needs to be organized or planned
- Asking for help with planning or structuring something
- Describing a problem that needs a systematic approach
- Using words related to projects, planning, goals, tasks, etc.

IMPORTANT: Cooking recipes, general questions, or requests for information are NOT project requests.

Respond with JSON only:
{
  "isProjectRequest": true/false,
  "confidence": 0.1-1.0,
  "reasoning": "brief explanation"
}`;

        try {
            const result = await this.model.generateContent(analysisPrompt);
            const response = result.response.text();
            const jsonMatch = response.match(/\{[\s\S]*?\}/);

            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                this.incrementUserCount('system'); // Count this API call
                return analysis;
            }
        } catch (error) {
            console.error('Error analyzing project creation:', error);
        }

        return { isProjectRequest: false, confidence: 0, reasoning: "Analysis failed" };
    }

    async extractProjectData(message) {
        const today = new Date();
        const dueDate = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

        const extractionPrompt = `
Based on this user message, extract project information and provide smart defaults:

User message: "${message}"

Create a comprehensive project structure. If specific information is not provided, use intelligent defaults.
Today's date is: ${today.toISOString().split('T')[0]}

Respond with JSON only:
{
  "title": "clear project title",
  "description": "detailed project description", 
  "timeline": number_of_days,
  "startDate": "${today.toISOString().split('T')[0]}",
  "dueDate": "${dueDate.toISOString().split('T')[0]}",
  "dueTime": "17:00",
  "priority": "High|Medium|Low",
  "category": "Development|Marketing|Research|Planning|Personal|Business|Other",
  "tags": ["relevant", "tags"],
  "estimatedComplexity": "Low|Medium|High"
}`;

        try {
            const result = await this.model.generateContent(extractionPrompt);
            const response = result.response.text();
            const jsonMatch = response.match(/\{[\s\S]*?\}/);

            if (jsonMatch) {
                this.incrementUserCount('system');
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error('Error extracting project data:', error);
        }

        return {
            title: "New Project",
            description: "Project description to be refined",
            timeline: 30,
            startDate: today.toISOString().split('T')[0],
            dueDate: dueDate.toISOString().split('T')[0],
            dueTime: "17:00",
            priority: "Medium",
            category: "General",
            tags: [],
            estimatedComplexity: "Medium"
        };
    }

    async generateProjectTasks(projectData) {
        const prompt = `
Create a detailed task breakdown for this project:

Project: ${projectData.title}
Description: ${projectData.description}
Timeline: ${projectData.timeline} days
Priority: ${projectData.priority}
Category: ${projectData.category}

Generate 5-12 specific, actionable subtasks. Each task should be something concrete that can be completed.

Respond with JSON only:
{
  "subtasks": [
    {
      "title": "Clear, actionable task title (max 80 chars)",
      "description": "Detailed description with specific deliverables",
      "estimatedHours": 2.5,
      "priority": "High|Medium|Low",
      "order": 1,
      "phase": "Planning|Execution|Review|QA",
      "complexity": "Low|Medium|High",
      "startDate": "YYYY-MM-DD",
      "dueDate": "YYYY-MM-DD"
    }
  ],
  "totalEstimatedHours": 25.5
}`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();
            const jsonMatch = response.match(/\{[\s\S]*?\}/);

            if (jsonMatch) {
                const tasksResponse = JSON.parse(jsonMatch[0]);
                this.incrementUserCount('system');

                const projectStart = new Date(projectData.startDate);
                const projectEnd = new Date(projectData.dueDate);
                const totalDays = Math.ceil((projectEnd - projectStart) / (1000 * 60 * 60 * 24));

                tasksResponse.subtasks = tasksResponse.subtasks.map((task, index) => {
                    if (!task.startDate || !task.dueDate) {
                        const taskStartOffset = Math.floor((index / tasksResponse.subtasks.length) * totalDays);
                        const taskDuration = Math.ceil(task.estimatedHours / 8) || 1;

                        const taskStart = new Date(projectStart);
                        taskStart.setDate(taskStart.getDate() + taskStartOffset);

                        const taskEnd = new Date(taskStart);
                        taskEnd.setDate(taskEnd.getDate() + taskDuration);

                        task.startDate = taskStart.toISOString().split('T')[0];
                        task.dueDate = taskEnd.toISOString().split('T')[0];
                    }

                    return task;
                });

                return tasksResponse;
            }
        } catch (error) {
            console.error('Error generating project tasks:', error);
        }

        return {
            subtasks: [],
            totalEstimatedHours: 0
        };
    }

    formatProjectCreationResponse(projectData, subtasksResponse) {
        const taskCount = subtasksResponse.subtasks?.length || 0;
        const hours = subtasksResponse.totalEstimatedHours || 0;

        return `Great! I've analyzed your request and created a project plan for "${projectData.title}".

📋 **Project Overview:**
• **Timeline:** ${projectData.timeline} days
• **Priority:** ${projectData.priority}
• **Category:** ${projectData.category}

📝 **Generated Tasks:** ${taskCount} tasks
⏱️ **Estimated Time:** ${hours} hours

${taskCount > 0 ? '**Tasks include:**\n' + subtasksResponse.subtasks.slice(0, 3).map((task, i) => `${i + 1}. ${task.title}`).join('\n') : ''}
${taskCount > 3 ? `... and ${taskCount - 3} more tasks` : ''}

Would you like me to create this project for you? Click the "Create Project" button to add it to your dashboard with all the tasks ready to go!`;
    }

    buildConversationContext(recentMessages = []) {
        if (!recentMessages || recentMessages.length === 0) {
            return '';
        }

        const contextMessages = recentMessages
            .slice(-3) // Reduced from 5 to 3 to save tokens
            .map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
            .join('\n');

        return `Previous conversation:\n${contextMessages}\n\n`;
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