// src/services/aiService.js
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

    async generateProjectTasks(projectData) {
        const { name, description, timeline, startDate, dueDate, priority, category } = projectData;

        // Check cache for similar projects
        const cacheKey = this.generateCacheKey(projectData);
        if (this.projectPatterns.has(cacheKey)) {
            console.log('Using cached project pattern');
            return this.adaptCachedPattern(this.projectPatterns.get(cacheKey), projectData);
        }

        const prompt = this.buildProjectTaskPrompt(projectData);

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            // Enhanced JSON extraction with better error handling
            const parsedResponse = this.extractAndValidateJSON(response);

            // Post-process the response
            const enhancedResponse = this.enhanceTaskResponse(parsedResponse, projectData);

            // Cache successful patterns
            this.projectPatterns.set(cacheKey, enhancedResponse);

            return enhancedResponse;
        } catch (error) {
            console.error('Error generating tasks from AI:', error);

            // Fallback to template-based generation
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

                // Clean up dependencies - remove for now since we'll handle them after subtask creation
                task.dependencies = [];
            });

            return parsedResponse;
        } catch (error) {
            console.error('JSON parsing error:', error);
            throw new Error('Failed to parse AI response');
        }
    }

    enhanceTaskResponse(parsedResponse, projectData) {
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
        console.log('Generating fallback tasks for project:', projectData.name);

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

    async generateTaskSuggestions(projectId, currentTasks) {
        const prompt = `
Based on the current project tasks, analyze what might be missing and suggest 2-4 additional tasks that would improve project success:

CURRENT TASKS:
${currentTasks.map(task => `- ${task.title}: ${task.description} (${task.estimatedHours}h, ${task.priority})`).join('\n')}

ANALYSIS FOCUS:
1. Missing critical phases (planning, testing, documentation, deployment)
2. Quality assurance gaps
3. Risk mitigation tasks
4. Communication and stakeholder management
5. Knowledge transfer and documentation

Provide suggestions in JSON format:
{
  "suggestions": [
    {
      "title": "Suggested task title",
      "description": "Detailed description of the task",
      "estimatedHours": 2.5,
      "priority": "High|Medium|Low",
      "reasoning": "Why this task is important for project success",
      "phase": "Planning|Execution|Review",
      "type": "Missing|Enhancement|Risk Mitigation",
      "dependencies": []
    }
  ],
  "analysis": {
    "gaps": ["identified gaps"],
    "strengths": ["current strengths"],
    "recommendations": ["overall recommendations"]
  }
}
`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Invalid response format from AI');
            }

            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error('Error generating task suggestions:', error);
            return {
                suggestions: [],
                analysis: {
                    gaps: ['Unable to analyze at this time'],
                    strengths: ['Tasks appear to be well-structured'],
                    recommendations: ['Consider reviewing task completeness manually']
                }
            };
        }
    }

    async optimizeTaskOrder(tasks, projectConstraints) {
        const prompt = `
Analyze the following tasks and suggest an optimal order considering dependencies, priorities, resource constraints, and project flow:

TASKS:
${tasks.map((task, index) => `${index + 1}. ${task.title} (${task.priority} priority, ${task.estimatedHours}h, Phase: ${task.phase || 'Unknown'})`).join('\n')}

CONSTRAINTS:
${JSON.stringify(projectConstraints, null, 2)}

OPTIMIZATION CRITERIA:
1. Critical path optimization
2. Resource utilization
3. Risk mitigation
4. Dependency resolution
5. Phase-based grouping

Provide optimization in JSON format:
{
  "optimizedOrder": [
    {
      "taskTitle": "Task title",
      "newOrder": 1,
      "reasoning": "Why this task should be in this position",
      "phase": "Planning|Execution|Review",
      "parallelWith": ["tasks that can run in parallel"]
    }
  ],
  "parallelTracks": [
    {
      "track": "Development",
      "tasks": ["Task 1", "Task 2"]
    }
  ],
  "warnings": ["Potential issues with the current order"],
  "recommendations": ["Optimization recommendations"],
  "estimatedSavings": "Time or resource savings from optimization"
}
`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Invalid response format from AI');
            }

            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error('Error optimizing task order:', error);
            return {
                optimizedOrder: tasks.map((task, index) => ({
                    taskTitle: task.title,
                    newOrder: index + 1,
                    reasoning: 'Current order maintained due to optimization error'
                })),
                warnings: ['Task optimization failed - current order maintained'],
                recommendations: ['Review task dependencies manually']
            };
        }
    }

    async generateProjectSummary(projectData, subtasks) {
        const prompt = `
Create a comprehensive project summary based on the project details and generated subtasks:

PROJECT: ${projectData.name}
DESCRIPTION: ${projectData.description}
TIMELINE: ${projectData.timeline} days
PRIORITY: ${projectData.priority}
SUBTASKS: ${subtasks.length} tasks

SUBTASK OVERVIEW:
${subtasks.slice(0, 5).map(task => `- ${task.title} (${task.estimatedHours}h)`).join('\n')}
${subtasks.length > 5 ? `... and ${subtasks.length - 5} more tasks` : ''}

Create a professional summary including:
- Executive overview
- Key deliverables and milestones
- Resource requirements
- Success criteria
- Risk assessment
- Next steps

Keep it under 300 words and make it stakeholder-friendly.
`;

        try {
            const result = await this.model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.error('Error generating project summary:', error);
            return `Project ${projectData.name}: ${projectData.description}\n\nThis ${projectData.timeline}-day project includes ${subtasks.length} tasks with an estimated ${subtasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0)} hours of work.`;
        }
    }

    // New method for generating smart notifications
    async generateSmartNotifications(projectData, subtasks, userActivity) {
        const overdueSubtasks = subtasks.filter(task =>
            new Date(task.dueDate) < new Date() && task.status !== 'Completed'
        );

        const upcomingDeadlines = subtasks.filter(task => {
            const dueDate = new Date(task.dueDate);
            const now = new Date();
            const daysDiff = (dueDate - now) / (1000 * 60 * 60 * 24);
            return daysDiff > 0 && daysDiff <= 3 && task.status !== 'Completed';
        });

        const notifications = [];

        // Overdue tasks
        if (overdueSubtasks.length > 0) {
            notifications.push({
                type: 'warning',
                title: 'Overdue Tasks',
                message: `${overdueSubtasks.length} task(s) are overdue in project "${projectData.name}"`,
                priority: 'high',
                tasks: overdueSubtasks.map(t => t.title)
            });
        }

        // Upcoming deadlines
        if (upcomingDeadlines.length > 0) {
            notifications.push({
                type: 'info',
                title: 'Upcoming Deadlines',
                message: `${upcomingDeadlines.length} task(s) due within 3 days`,
                priority: 'medium',
                tasks: upcomingDeadlines.map(t => t.title)
            });
        }

        return notifications;
    }

    // Method to clear cache periodically
    clearCache() {
        this.projectPatterns.clear();
        console.log('AI Service cache cleared');
    }
}

module.exports = new AIService();