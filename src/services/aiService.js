// src/services/aiService.js - Unified AI Service (Production)
const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
    constructor() {
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

        // Cache for similar project patterns
        this.projectPatterns = new Map();
        this.dailyChatQuota = new Map();
        this.MAX_DAILY_CHATS = 10;
    }

    checkQuota(userId) {
        const today = new Date().toISOString().split('T')[0];
        let quota = this.dailyChatQuota.get(userId);
        if (!quota || quota.date !== today) {
            quota = { date: today, count: 0 };
        }
        if (quota.count >= this.MAX_DAILY_CHATS) {
            return false;
        }
        quota.count += 1;
        this.dailyChatQuota.set(userId, quota);
        return true;
    }

    getWelcomeMessage() {
        return {
            message: `👋 Welcome to TaskMe AI! I'm here to help you plan and manage your projects.

To get started, please tell me:
- What is your project about?
- What is your desired timeline (in days)?
- When would you like to start?

This info helps me break down your project into actionable tasks with realistic deadlines.`,
            type: 'welcome'
        };
    }

    async generateProjectTasks(projectData) {
        const { name, description, timeline, startDate, dueDate, priority, category } = projectData;

        // Check cache for similar projects
        const cacheKey = this.generateCacheKey(projectData);
        if (this.projectPatterns.has(cacheKey)) {
            return this.adaptCachedPattern(this.projectPatterns.get(cacheKey), projectData);
        }

        const prompt = this.buildProjectTaskPrompt(projectData);

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();
            const parsedResponse = this.extractAndValidateJSON(response);
            const enhancedResponse = this.enhanceTaskResponse(parsedResponse, projectData);

            // Cache successful patterns
            this.projectPatterns.set(cacheKey, enhancedResponse);

            return enhancedResponse;
        } catch (error) {
            // Fallback to template-based generation
            return this.generateFallbackTasks(projectData);
        }
    }

    buildProjectTaskPrompt(projectData) {
        const { name, description, timeline, startDate, dueDate, priority, category } = projectData;

        return `
You are an expert project management AI assistant with extensive experience in breaking down complex projects into manageable tasks.

PROJECT CONTEXT:
- Name: ${name}
- Description: ${description}
- Timeline: ${timeline} days
- Start Date: ${startDate}
- Due Date: ${dueDate}
- Priority: ${priority}
- Category: ${category || 'General'}

TASK BREAKDOWN REQUIREMENTS:
1. Create 5-15 specific, actionable subtasks
2. Each task should follow SMART criteria (Specific, Measurable, Achievable, Relevant, Time-bound)
3. Include realistic time estimates (0.5-40 hours per task)
4. Consider logical dependencies and task sequencing
5. Include planning, execution, review, and quality assurance phases
6. Account for buffer time and potential roadblocks
7. Ensure tasks align with the project priority level

IMPORTANT: For dependencies, use numeric indices (starting from 0) instead of task titles. For example, if task 2 depends on task 0, use "dependencies": [0]

RESPONSE FORMAT (JSON only):
{
  "subtasks": [
    {
      "title": "Clear, actionable task title (max 80 chars)",
      "description": "Detailed description with specific deliverables and acceptance criteria",
      "estimatedHours": 4.5,
      "priority": "High|Medium|Low",
      "order": 1,
      "dependencies": [0, 1],
      "tags": ["relevant", "tags"],
      "phase": "Planning|Execution|Review|QA",
      "skills": ["required", "skills"],
      "complexity": "Low|Medium|High",
      "riskLevel": "Low|Medium|High"
    }
  ],
  "totalEstimatedHours": 45.5,
  "criticalPath": [0, 2, 4],
  "milestones": [
    {
      "name": "Milestone name",
      "description": "What marks this milestone",
      "taskIndices": [0, 1],
      "estimatedCompletion": "25% through project"
    }
  ],
  "riskFactors": [
    "Potential risk 1",
    "Potential risk 2"
  ],
  "suggestions": [
    "Actionable recommendation 1",
    "Actionable recommendation 2"
  ],
  "resources": [
    "Required resource 1",
    "Required resource 2"
  ]
}

IMPORTANT: 
- Use numeric indices for dependencies, NOT task titles
- Ensure dependencies reference valid task indices (0-based)
- Total estimated hours should be realistic for the ${timeline}-day timeline (assume 6-8 working hours per day)
`;
    }

    extractAndValidateJSON(response) {
        try {
            // Try to find JSON in the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsedResponse = JSON.parse(jsonMatch[0]);

            // Validate required fields
            if (!parsedResponse.subtasks || !Array.isArray(parsedResponse.subtasks)) {
                throw new Error('Invalid subtasks structure');
            }

            if (parsedResponse.subtasks.length === 0) {
                throw new Error('No subtasks generated');
            }

            // Validate each subtask and clean up dependencies
            parsedResponse.subtasks.forEach((task, index) => {
                if (!task.title || !task.description) {
                    throw new Error(`Subtask ${index + 1} missing required fields`);
                }

                // Set defaults for missing fields
                task.estimatedHours = task.estimatedHours || 2;
                task.priority = task.priority || 'Medium';
                task.order = task.order || (index + 1);
                task.phase = task.phase || 'Execution';
                task.complexity = task.complexity || 'Medium';
                task.riskLevel = task.riskLevel || 'Low';
                task.skills = task.skills || [];
                task.tags = task.tags || [];
                task.dependencies = [];
            });

            return parsedResponse;
        } catch (error) {
            throw new Error('Failed to parse AI response');
        }
    }

    enhanceTaskResponse(parsedResponse, projectData) {
        // Enhanced date validation and parsing - ALWAYS use future dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let projectStart, projectEnd;

        try {
            // Parse project dates but ensure they're never in the past
            const providedStartDate = new Date(projectData.startDate);
            const providedEndDate = new Date(projectData.dueDate);

            // Force start date to be today or later
            projectStart = providedStartDate < today ? new Date(today) : providedStartDate;

            // Force end date to be after start date
            if (providedEndDate <= projectStart) {
                projectEnd = new Date(projectStart);
                projectEnd.setDate(projectEnd.getDate() + (projectData.timeline || 30));
            } else {
                projectEnd = providedEndDate;
            }

        } catch (error) {
            projectStart = new Date(today);
            projectEnd = new Date(today);
            projectEnd.setDate(projectEnd.getDate() + (projectData.timeline || 30));
        }

        const totalTasks = parsedResponse.subtasks.length;

        // Enhanced task scheduling with bulletproof FUTURE-ONLY date handling
        parsedResponse.subtasks = parsedResponse.subtasks.map((task, index) => {
            try {
                // Calculate task duration based on estimated hours (minimum 1 day)
                const taskDuration = Math.max(1, Math.ceil((task.estimatedHours || 2) / 8));

                let taskStartDate;

                if (index === 0) {
                    // First task starts on project start date
                    taskStartDate = new Date(projectStart.getTime());
                } else {
                    // Subsequent tasks start after previous task with 1-day buffer
                    const prevTask = parsedResponse.subtasks[index - 1];
                    const prevEndDate = new Date(prevTask.dueDate);

                    if (isNaN(prevEndDate.getTime())) {
                        // Fallback: use project start + index days
                        taskStartDate = new Date(projectStart.getTime());
                        taskStartDate.setDate(taskStartDate.getDate() + index);
                    } else {
                        taskStartDate = new Date(prevEndDate.getTime());
                        taskStartDate.setDate(taskStartDate.getDate() + 1);
                    }
                }

                // Ensure task start is never in the past
                if (taskStartDate < today) {
                    taskStartDate = new Date(today.getTime());
                    taskStartDate.setDate(taskStartDate.getDate() + index + 1);
                }

                // Calculate due date
                const taskDueDate = new Date(taskStartDate.getTime());
                taskDueDate.setDate(taskDueDate.getDate() + taskDuration);

                // Final safety check - ensure both dates are valid and in the future
                const safeStartDate = taskStartDate < today ?
                    (() => {
                        const safe = new Date(today.getTime());
                        safe.setDate(safe.getDate() + index + 1);
                        return safe;
                    })() : taskStartDate;

                const safeDueDate = taskDueDate <= safeStartDate ?
                    (() => {
                        const safe = new Date(safeStartDate.getTime());
                        safe.setDate(safe.getDate() + Math.max(1, taskDuration));
                        return safe;
                    })() : taskDueDate;

                // Validate date objects before formatting
                if (isNaN(safeStartDate.getTime()) || isNaN(safeDueDate.getTime())) {
                    // Emergency fix: Sequential future dates
                    const emergencyStart = new Date(today.getTime());
                    emergencyStart.setDate(emergencyStart.getDate() + index + 1);

                    const emergencyDue = new Date(emergencyStart.getTime());
                    emergencyDue.setDate(emergencyDue.getDate() + Math.max(1, taskDuration));

                    return {
                        ...task,
                        startDate: emergencyStart.toISOString().split('T')[0],
                        dueDate: emergencyDue.toISOString().split('T')[0],
                        order: index + 1,
                        projectPhase: this.determineProjectPhase(index, totalTasks),
                        estimatedProgress: Math.round(((index + 1) / totalTasks) * 100),
                        dateWarning: 'Emergency future dates applied due to invalid date calculation'
                    };
                }

                // Format as YYYY-MM-DD strings
                const formattedStartDate = safeStartDate.toISOString().split('T')[0];
                const formattedDueDate = safeDueDate.toISOString().split('T')[0];

                // Final validation: Ensure dates are valid and in the future
                const startDateObj = new Date(formattedStartDate);
                const dueDateObj = new Date(formattedDueDate);

                if (startDateObj < today || dueDateObj < today || dueDateObj <= startDateObj) {
                    // Emergency fix: Sequential future dates
                    const emergencyStart = new Date(today.getTime());
                    emergencyStart.setDate(emergencyStart.getDate() + index + 1);

                    const emergencyDue = new Date(emergencyStart.getTime());
                    emergencyDue.setDate(emergencyDue.getDate() + Math.max(1, taskDuration));

                    return {
                        ...task,
                        startDate: emergencyStart.toISOString().split('T')[0],
                        dueDate: emergencyDue.toISOString().split('T')[0],
                        order: index + 1,
                        projectPhase: this.determineProjectPhase(index, totalTasks),
                        estimatedProgress: Math.round(((index + 1) / totalTasks) * 100),
                        dateWarning: 'Emergency future dates applied after final validation failure'
                    };
                }

                return {
                    ...task,
                    startDate: formattedStartDate,
                    dueDate: formattedDueDate,
                    order: index + 1,
                    projectPhase: this.determineProjectPhase(index, totalTasks),
                    estimatedProgress: Math.round(((index + 1) / totalTasks) * 100)
                };

            } catch (taskError) {
                // Emergency fallback with guaranteed future dates
                const fallbackStart = new Date(today.getTime());
                fallbackStart.setDate(fallbackStart.getDate() + index + 1);

                const fallbackEnd = new Date(fallbackStart.getTime());
                fallbackEnd.setDate(fallbackEnd.getDate() + 2);

                return {
                    ...task,
                    startDate: fallbackStart.toISOString().split('T')[0],
                    dueDate: fallbackEnd.toISOString().split('T')[0],
                    order: index + 1,
                    projectPhase: 'Execution',
                    estimatedProgress: Math.round(((index + 1) / totalTasks) * 100),
                    dateWarning: 'Fallback future dates due to processing error'
                };
            }
        });

        // Final validation - ensure ALL dates are in the future
        const hasBackdatedTasks = parsedResponse.subtasks.some(task => {
            const taskStart = new Date(task.startDate);
            const taskDue = new Date(task.dueDate);
            return taskStart < today || taskDue < today || isNaN(taskStart.getTime()) || isNaN(taskDue.getTime());
        });

        if (hasBackdatedTasks) {
            // Final fix: Re-schedule all tasks sequentially from tomorrow
            let runningDate = new Date(today.getTime());
            runningDate.setDate(runningDate.getDate() + 1);

            parsedResponse.subtasks = parsedResponse.subtasks.map((task, index) => {
                const taskDuration = Math.max(1, Math.ceil((task.estimatedHours || 2) / 8));

                const taskStart = new Date(runningDate.getTime());
                const taskEnd = new Date(runningDate.getTime());
                taskEnd.setDate(taskEnd.getDate() + taskDuration);

                // Update running date for next task (add 1 day buffer)
                runningDate = new Date(taskEnd.getTime());
                runningDate.setDate(runningDate.getDate() + 1);

                return {
                    ...task,
                    startDate: taskStart.toISOString().split('T')[0],
                    dueDate: taskEnd.toISOString().split('T')[0],
                    dateWarning: 'Sequentially scheduled to ensure future dates'
                };
            });
        }

        return {
            ...parsedResponse,
            projectInsights: this.generateProjectInsights?.(parsedResponse, projectData),
            recommendedTeamSize: this.calculateRecommendedTeamSize?.(parsedResponse),
            estimatedBudget: this.estimateBudget?.(parsedResponse),
            successMetrics: this.generateSuccessMetrics?.(projectData)
        };
    }

    determineProjectPhase(taskIndex, totalTasks) {
        const percentage = (taskIndex + 1) / totalTasks;

        if (percentage <= 0.25) return 'Planning';
        if (percentage <= 0.75) return 'Execution';
        if (percentage <= 0.9) return 'Review';
        return 'QA';
    }

    generateProjectInsights(parsedResponse, projectData) {
        const insights = [];

        // Timeline analysis
        const workingDays = Math.ceil(parsedResponse.totalEstimatedHours / 8);
        if (workingDays > projectData.timeline) {
            insights.push({
                type: 'warning',
                message: `Estimated work (${workingDays} days) exceeds timeline (${projectData.timeline} days). Consider reducing scope or extending deadline.`
            });
        }

        // Complexity analysis
        const highComplexityTasks = parsedResponse.subtasks.filter(t => t.complexity === 'High').length;
        if (highComplexityTasks > parsedResponse.subtasks.length * 0.3) {
            insights.push({
                type: 'info',
                message: `Project has ${highComplexityTasks} high-complexity tasks. Consider breaking these down further.`
            });
        }

        // Risk analysis
        const highRiskTasks = parsedResponse.subtasks.filter(t => t.riskLevel === 'High').length;
        if (highRiskTasks > 0) {
            insights.push({
                type: 'warning',
                message: `${highRiskTasks} high-risk tasks identified. Develop mitigation strategies early.`
            });
        }

        return insights;
    }

    calculateRecommendedTeamSize(parsedResponse) {
        const totalHours = parsedResponse.totalEstimatedHours;
        const uniqueSkills = new Set();

        parsedResponse.subtasks.forEach(task => {
            task.skills.forEach(skill => uniqueSkills.add(skill));
        });

        // Basic calculation: 1 person per 40 hours of work, minimum skills coverage
        const hoursBasedSize = Math.ceil(totalHours / 160); // 160 hours = 1 month per person
        const skillsBasedSize = Math.max(1, Math.ceil(uniqueSkills.size / 2));

        return Math.max(hoursBasedSize, skillsBasedSize);
    }

    estimateBudget(parsedResponse) {
        // Simple budget estimation based on hours and complexity
        const baseHourlyRate = 50; // Base rate in USD

        let totalCost = 0;
        parsedResponse.subtasks.forEach(task => {
            let multiplier = 1;
            if (task.complexity === 'High') multiplier = 1.5;
            if (task.complexity === 'Low') multiplier = 0.8;

            totalCost += task.estimatedHours * baseHourlyRate * multiplier;
        });

        return {
            estimated: Math.round(totalCost),
            range: {
                min: Math.round(totalCost * 0.8),
                max: Math.round(totalCost * 1.3)
            }
        };
    }

    generateSuccessMetrics(projectData) {
        return [
            'All subtasks completed within estimated timeframe',
            'Project delivered by due date',
            'Quality standards met for all deliverables',
            'Budget maintained within 10% of estimate',
            'No critical risks materialized',
            'Stakeholder satisfaction rating above 4/5'
        ];
    }

    generateFallbackTasks(projectData) {
        // Create basic template-based tasks
        const basicTasks = [
            {
                title: 'Project Planning and Requirements Analysis',
                description: 'Define project scope, gather requirements, and create detailed project plan',
                estimatedHours: Math.max(2, Math.ceil(projectData.timeline * 0.2)),
                priority: 'High',
                phase: 'Planning',
                order: 1,
                dependencies: []
            },
            {
                title: 'Resource Allocation and Team Setup',
                description: 'Assign team members, allocate resources, and set up project infrastructure',
                estimatedHours: Math.max(1, Math.ceil(projectData.timeline * 0.1)),
                priority: 'High',
                phase: 'Planning',
                order: 2,
                dependencies: []
            },
            {
                title: 'Core Implementation',
                description: 'Execute the main project deliverables and core functionality',
                estimatedHours: Math.max(4, Math.ceil(projectData.timeline * 0.5)),
                priority: 'High',
                phase: 'Execution',
                order: 3,
                dependencies: []
            },
            {
                title: 'Quality Assurance and Testing',
                description: 'Perform comprehensive testing and quality assurance checks',
                estimatedHours: Math.max(2, Math.ceil(projectData.timeline * 0.15)),
                priority: 'Medium',
                phase: 'Review',
                order: 4,
                dependencies: []
            },
            {
                title: 'Final Review and Delivery',
                description: 'Conduct final review, gather feedback, and deliver project',
                estimatedHours: Math.max(1, Math.ceil(projectData.timeline * 0.05)),
                priority: 'High',
                phase: 'Review',
                order: 5,
                dependencies: []
            }
        ];

        const totalEstimatedHours = basicTasks.reduce((sum, task) => sum + task.estimatedHours, 0);

        return {
            subtasks: basicTasks,
            totalEstimatedHours,
            criticalPath: [0, 2, 4],
            suggestions: [
                'This is a basic template. Consider customizing tasks based on specific project requirements.',
                'Add more detailed subtasks once project scope is better defined.'
            ],
            fallbackUsed: true
        };
    }

    generateCacheKey(projectData) {
        // Create a simple cache key based on project characteristics
        const characteristics = [
            projectData.category || 'general',
            projectData.priority,
            Math.floor(projectData.timeline / 7), // Week groups
            projectData.description.length > 100 ? 'detailed' : 'simple'
        ];

        return characteristics.join('_');
    }

    adaptCachedPattern(cachedPattern, projectData) {
        // Adapt cached pattern to current project
        const adapted = JSON.parse(JSON.stringify(cachedPattern)); // Deep clone

        // Adjust timeline and dates
        adapted.subtasks = adapted.subtasks.map(task => {
            const adjustedHours = Math.max(0.5, task.estimatedHours * (projectData.timeline / 30)); // Normalize to 30-day baseline
            return {
                ...task,
                estimatedHours: Math.round(adjustedHours * 2) / 2, // Round to nearest 0.5
                dependencies: [] // Clear dependencies for adapted patterns
            };
        });

        adapted.totalEstimatedHours = adapted.subtasks.reduce((sum, task) => sum + task.estimatedHours, 0);
        adapted.fromCache = true;

        return adapted;
    }

    async generateChatResponse(userMessage, context = {}, userId = 'default') {
        if (!this.checkQuota(userId)) {
            return {
                message: "⚠️ You have reached your daily free chat limit. Please try again tomorrow.",
                type: 'quota_exceeded'
            };
        }

        try {
            const conversationContext = this.buildConversationContext(context.recentMessages);

            const prompt = `You are a helpful AI assistant specializing in project management and productivity. 
            
${conversationContext}

User: ${userMessage}

Please provide a helpful, conversational response. If the user is describing a project idea, goal, or task they want to accomplish, be encouraging and offer to help them organize it into a structured project plan.`;

            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            return {
                message: response,
                type: 'general_chat'
            };

        } catch (error) {
            return {
                message: "I'm here to help! Could you tell me more about what you're working on or what you'd like to accomplish?",
                type: 'fallback'
            };
        }
    }

    async generateEnhancedChatResponse(userMessage, context = {}) {
        try {
            // First check if this could be a project creation request
            const projectAnalysis = await this.analyzeForProjectCreation(userMessage);

            if (projectAnalysis.isProjectRequest) {
                // Generate project data and tasks
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

            // Otherwise, generate normal chat response
            return await this.generateChatResponse(userMessage, context);

        } catch (error) {
            return await this.generateChatResponse(userMessage, context);
        }
    }

    async analyzeForProjectCreation(message) {
        const analysisPrompt = `
Analyze this message to determine if the user wants to create a project or accomplish a goal that could be organized as a project:

Message: "${message}"

Look for indicators like:
- Describing a goal or objective they want to achieve
- Mentioning work that needs to be organized or planned
- Asking for help with planning or structuring something
- Describing a problem that needs a systematic approach
- Using words related to projects, planning, goals, tasks, etc.

Respond with JSON only:
{
  "isProjectRequest": true/false,
  "confidence": 0.1-1.0,
  "reasoning": "brief explanation"
}`;

        try {
            const result = await this.model.generateContent(analysisPrompt);
            const response = result.response.text();
            const jsonMatch = response.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                return analysis;
            }
        } catch (error) {
            // Silent fallback
        }

        return { isProjectRequest: false, confidence: 0, reasoning: "Analysis failed" };
    }

    async extractProjectData(message) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.getFullYear() + '-' +
            String(today.getMonth() + 1).padStart(2, '0') + '-' +
            String(today.getDate()).padStart(2, '0');

        const extractionPrompt = `
Based on this user message, extract project information and provide smart defaults:

User message: "${message}"

Create a comprehensive project structure. If specific information is not provided, use intelligent defaults.
IMPORTANT: 
- All dates must be today (${todayStr}) or later
- Description must be concise and under 400 characters (max 400 chars)
- Focus on key project objectives and deliverables in the description

Respond with JSON only:
{
  "name": "clear project title (max 100 characters)",
  "description": "concise project description focusing on main objectives and deliverables (MAX 400 characters)", 
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

                // Enforce character limits
                data.name = (data.name || "New Project").substring(0, 100);
                data.description = (data.description || "Project description to be refined").substring(0, 400);

                // Force set startDate to today or later
                const extractedStartDate = data.startDate ? new Date(data.startDate) : today;
                if (extractedStartDate < today) {
                    data.startDate = todayStr;
                } else {
                    data.startDate = extractedStartDate.toISOString().split('T')[0];
                }

                // Ensure timeline is valid
                data.timeline = Math.max(1, data.timeline || 30);

                // Always recalculate dueDate to ensure it's in the future
                const dueDate = new Date(data.startDate);
                dueDate.setDate(dueDate.getDate() + data.timeline);
                data.dueDate = dueDate.toISOString().split('T')[0];

                return data;
            }
        } catch (error) {
            // Silent fallback
        }

        // Fallback project data with guaranteed future dates and proper lengths
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        return {
            name: "New Project",
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
    }

    formatProjectCreationResponse(projectData, subtasksResponse) {
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
    }

    buildConversationContext(recentMessages = []) {
        if (!recentMessages || recentMessages.length === 0) {
            return '';
        }

        const contextMessages = recentMessages
            .slice(-5) // Only last 5 messages
            .map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
            .join('\n');

        return `Previous conversation:\n${contextMessages}\n\n`;
    }

    // === UTILITY METHODS ===

    async interceptAndEnhancePrompt(chatMessage) {
        // This method exists for backward compatibility
        const analysis = await this.analyzeForProjectCreation(chatMessage);

        if (analysis.isProjectRequest) {
            const projectData = await this.extractProjectData(chatMessage);
            return {
                wasEnhanced: true,
                projectData,
                analysis
            };
        }

        return {
            wasEnhanced: false,
            analysis
        };
    }

    clearCache() {
        this.projectPatterns.clear();
        console.log('🧹 AI Service cache cleared');
    }
}

module.exports = new AIService();