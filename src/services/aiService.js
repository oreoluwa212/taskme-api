// src/services/aiService.js - Unified AI Service
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
    }

    // === PROJECT GENERATION METHODS ===

    async generateProjectTasks(projectData) {
        console.log('🤖 AIService.generateProjectTasks called with:', {
            name: projectData.name,
            timeline: projectData.timeline,
            priority: projectData.priority
        });

        const { name, description, timeline, startDate, dueDate, priority, category } = projectData;

        // Check cache for similar projects
        const cacheKey = this.generateCacheKey(projectData);
        if (this.projectPatterns.has(cacheKey)) {
            console.log('✅ Using cached project pattern');
            return this.adaptCachedPattern(this.projectPatterns.get(cacheKey), projectData);
        }

        const prompt = this.buildProjectTaskPrompt(projectData);

        try {
            console.log('📤 Sending prompt to AI model...');
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            console.log('📥 AI response received, parsing...');
            // Enhanced JSON extraction with better error handling
            const parsedResponse = this.extractAndValidateJSON(response);

            // Post-process the response
            const enhancedResponse = this.enhanceTaskResponse(parsedResponse, projectData);

            // Cache successful patterns
            this.projectPatterns.set(cacheKey, enhancedResponse);

            console.log('✅ Project tasks generated successfully:', {
                totalTasks: enhancedResponse.subtasks?.length || 0,
                estimatedHours: enhancedResponse.totalEstimatedHours || 0
            });

            return enhancedResponse;
        } catch (error) {
            console.error('❌ Error generating tasks from AI:', error);

            // Fallback to template-based generation
            console.log('🔄 Using fallback task generation...');
            return this.generateFallbackTasks(projectData);
        }
    }

    buildProjectTaskPrompt(projectData) {
        const { name, description, timeline, startDate, dueDate, priority, category } = projectData;

        // Enhanced prompt with better context and examples
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
            console.log('🔍 Extracting JSON from AI response...');
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

            console.log(`✅ Parsed ${parsedResponse.subtasks.length} subtasks from AI response`);

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

                // Clean up dependencies - remove for now since we'll handle them after subtask creation
                task.dependencies = [];
            });

            return parsedResponse;
        } catch (error) {
            console.error('❌ JSON parsing error:', error);
            throw new Error('Failed to parse AI response');
        }
    }

    enhanceTaskResponse(parsedResponse, projectData) {
        console.log('🔧 Enhancing task response with dates and metadata...');
        const projectStart = new Date(projectData.startDate);
        const projectEnd = new Date(projectData.dueDate);
        const totalDays = Math.ceil((projectEnd - projectStart) / (1000 * 60 * 60 * 24));

        // Calculate more intelligent task scheduling
        parsedResponse.subtasks = parsedResponse.subtasks.map((task, index) => {
            // Calculate task duration based on estimated hours
            const taskDuration = Math.ceil(task.estimatedHours / 8);

            // Calculate start date based on project timeline
            const taskStartOffset = Math.floor((index / parsedResponse.subtasks.length) * totalDays);

            const taskStartDate = new Date(projectStart);
            taskStartDate.setDate(taskStartDate.getDate() + taskStartOffset);

            const taskDueDate = new Date(taskStartDate);
            taskDueDate.setDate(taskDueDate.getDate() + taskDuration);

            return {
                ...task,
                startDate: taskStartDate.toISOString(),
                dueDate: taskDueDate.toISOString(),
                order: index + 1,
                projectPhase: this.determineProjectPhase(index, parsedResponse.subtasks.length),
                estimatedProgress: Math.round(((index + 1) / parsedResponse.subtasks.length) * 100)
            };
        });

        // Add project-specific enhancements
        return {
            ...parsedResponse,
            projectInsights: this.generateProjectInsights(parsedResponse, projectData),
            recommendedTeamSize: this.calculateRecommendedTeamSize(parsedResponse),
            estimatedBudget: this.estimateBudget(parsedResponse),
            successMetrics: this.generateSuccessMetrics(projectData)
        };
    }

    determineProjectPhase(taskIndex, totalTasks) {
        const progress = (taskIndex + 1) / totalTasks;
        if (progress <= 0.25) return 'Planning';
        if (progress <= 0.8) return 'Execution';
        return 'Review';
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
        console.log('🔄 Generating fallback tasks for project:', projectData.name);

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

        console.log(`✅ Generated ${basicTasks.length} fallback tasks`);

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
        console.log('♻️ Adapting cached pattern to current project');
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

    // === CHAT METHODS ===

    async generateChatResponse(userMessage, context = {}) {
        try {
            console.log('💬 Generating chat response for:', userMessage.substring(0, 50) + '...');
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
            console.error('❌ Error generating chat response:', error);
            return {
                message: "I'm here to help! Could you tell me more about what you're working on or what you'd like to accomplish?",
                type: 'fallback'
            };
        }
    }

    async generateEnhancedChatResponse(userMessage, context = {}) {
        try {
            console.log('🤖 Generating enhanced chat response...');
            // First check if this could be a project creation request
            const projectAnalysis = await this.analyzeForProjectCreation(userMessage);

            if (projectAnalysis.isProjectRequest) {
                console.log('📋 Detected project creation request');
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
            console.error('❌ Error generating enhanced chat response:', error);
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
            console.error('❌ Error analyzing project creation:', error);
        }

        return { isProjectRequest: false, confidence: 0, reasoning: "Analysis failed" };
    }

    async extractProjectData(message) {
        const extractionPrompt = `
Based on this user message, extract project information and provide smart defaults:

User message: "${message}"

Create a comprehensive project structure. If specific information is not provided, use intelligent defaults.

Respond with JSON only:
{
  "name": "clear project title",
  "description": "detailed project description", 
  "timeline": number_of_days,
  "startDate": "YYYY-MM-DD format (today's date)",
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
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error('❌ Error extracting project data:', error);
        }

        // Fallback project data
        const today = new Date();
        const dueDate = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

        return {
            name: "New Project",
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

    formatProjectCreationResponse(projectData, subtasksResponse) {
        const taskCount = subtasksResponse.subtasks?.length || 0;
        const hours = subtasksResponse.totalEstimatedHours || 0;

        return `Great! I've analyzed your request and created a project plan for "${projectData.name}".

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