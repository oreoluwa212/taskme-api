const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIProjectService {
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
        this.projectPatterns = new Map();
    }

    async interceptAndEnhancePrompt(userMessage, context = {}) {
        try {
            console.log('🔍 Intercepting user prompt:', userMessage);

            // Step 1: Analyze the user's intent and extract basic project info
            const projectAnalysis = await this.analyzeProjectIntent(userMessage);

            // Step 2: If it's a project creation request, enhance the prompt
            if (projectAnalysis.isProjectRequest) {
                console.log('📋 Detected project creation request');

                const enhancedPrompt = await this.enhanceProjectPrompt(userMessage, projectAnalysis);

                // Step 3: Generate detailed project data using enhanced prompt
                const projectData = await this.generateProjectFromEnhancedPrompt(enhancedPrompt, projectAnalysis);

                return {
                    originalMessage: userMessage,
                    enhancedPrompt: enhancedPrompt.userFacingDescription,
                    projectData: projectData,
                    wasEnhanced: true,
                    analysis: projectAnalysis
                };
            }

            // If not a project request, handle as regular chat
            return {
                originalMessage: userMessage,
                enhancedPrompt: userMessage,
                wasEnhanced: false,
                analysis: projectAnalysis
            };

        } catch (error) {
            console.error('❌ Error in prompt interception:', error);
            return {
                originalMessage: userMessage,
                enhancedPrompt: userMessage,
                wasEnhanced: false,
                error: error.message
            };
        }
    }

    // Analyze if user message is requesting project creation
    async analyzeProjectIntent(userMessage) {
        const analysisPrompt = `
Analyze this user message to determine if they want to create a project and extract key information:

User Message: "${userMessage}"

Determine:
1. Is this a project creation request?
2. What type of project (web app, mobile app, website, marketing campaign, etc.)?
3. What domain/industry (e.g., social media, e-commerce, education, healthcare)?
4. What key features or requirements are mentioned?
5. Any timeline or deadline mentioned?
6. Priority level if mentioned?
7. What critical information is missing that would help create a detailed project plan?

Respond with JSON only:
{
  "isProjectRequest": boolean,
  "confidence": 0.1-1.0,
  "projectType": "mobile app|web app|website|marketing|research|other|null",
  "domain": "social media|e-commerce|education|healthcare|finance|entertainment|productivity|other|null",
  "extractedInfo": {
    "title": "suggested project title or null",
    "description": "extracted description or null",
    "features": ["list of mentioned features"],
    "timeline": "extracted timeline or null",
    "priority": "High|Medium|Low|null",
    "platform": "iOS|Android|Web|Desktop|null",
    "targetAudience": "extracted audience or null"
  },
  "missingCriticalInfo": [
    "list of missing information needed for detailed planning"
  ],
  "suggestedEnhancements": [
    "specific questions or details that would improve the project plan"
  ],
  "keywords": ["key terms that indicate project type"]
}`;

        try {
            const result = await this.model.generateContent(analysisPrompt);
            const response = result.response.text();

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error('Error analyzing project intent:', error);
        }

        return {
            isProjectRequest: false,
            confidence: 0,
            extractedInfo: {},
            missingCriticalInfo: [],
            suggestedEnhancements: []
        };
    }

    // Enhanced prompt generation with industry best practices
    async enhanceProjectPrompt(originalMessage, analysis) {
        const enhancementPrompt = `
Take this user's project request and enhance it with professional project management details and industry best practices.

Original Request: "${originalMessage}"

Project Analysis:
- Type: ${analysis.projectType}
- Domain: ${analysis.domain}  
- Confidence: ${analysis.confidence}
- Extracted Features: ${analysis.extractedInfo.features?.join(', ') || 'None specified'}
- Missing Info: ${analysis.missingCriticalInfo?.join(', ') || 'None'}

ENHANCEMENT RULES:
1. Keep the user's original vision and requirements intact
2. Add professional project management structure
3. Include industry-standard phases and deliverables
4. Add realistic timeline estimates based on project complexity
5. Include risk assessment and quality assurance considerations
6. Add technical and business requirements that are commonly needed
7. Suggest team roles and skill requirements

Create an enhanced project description that includes:

ENHANCED PROJECT SPECIFICATION:
{
  "userFacingDescription": "A clear, enhanced description the user will see",
  "technicalRequirements": {
    "functionalRequirements": ["detailed functional requirements"],
    "nonFunctionalRequirements": ["performance, security, scalability requirements"],
    "technicalConstraints": ["technology, platform, integration constraints"]
  },
  "projectScope": {
    "inScope": ["what's included in the project"],
    "outOfScope": ["what's explicitly not included"],
    "assumptions": ["project assumptions"]
  },
  "deliverables": ["main project deliverables"],
  "successCriteria": ["how success will be measured"],
  "riskFactors": ["potential risks and challenges"],
  "estimatedComplexity": "Low|Medium|High",
  "recommendedTimeline": "X weeks/months",
  "recommendedTeamSize": "X people",
  "criticalSuccessFactors": ["key things that must go right"]
}

Respond with JSON only.`;

        try {
            const result = await this.model.generateContent(enhancementPrompt);
            const response = result.response.text();

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error('Error enhancing prompt:', error);
        }

        // Fallback enhancement
        return {
            userFacingDescription: `Enhanced: ${originalMessage}`,
            technicalRequirements: {
                functionalRequirements: ["Core functionality as specified"],
                nonFunctionalRequirements: ["Performance optimization", "Security implementation"],
                technicalConstraints: ["Platform compatibility", "Browser support"]
            },
            projectScope: {
                inScope: ["Basic functionality", "User interface", "Core features"],
                outOfScope: ["Advanced analytics", "Third-party integrations"],
                assumptions: ["Standard hosting environment", "Basic user load"]
            },
            estimatedComplexity: "Medium",
            recommendedTimeline: "8-12 weeks"
        };
    }

    // Generate comprehensive project data from enhanced prompt
    async generateProjectFromEnhancedPrompt(enhancedPrompt, analysis) {
        const { extractedInfo } = analysis;

        // Create comprehensive project data
        const projectData = {
            name: extractedInfo.title || this.generateProjectTitle(analysis),
            description: enhancedPrompt.userFacingDescription,
            timeline: this.parseTimelineTodays(extractedInfo.timeline, enhancedPrompt.recommendedTimeline),
            startDate: new Date().toISOString(),
            dueDate: this.calculateDueDate(this.parseTimelineTodays(extractedInfo.timeline, enhancedPrompt.recommendedTimeline)),
            priority: extractedInfo.priority || 'High',
            category: analysis.domain || analysis.projectType || 'General',

            // Enhanced fields from prompt enhancement
            technicalRequirements: enhancedPrompt.technicalRequirements,
            projectScope: enhancedPrompt.projectScope,
            deliverables: enhancedPrompt.deliverables || [],
            successCriteria: enhancedPrompt.successCriteria || [],
            riskFactors: enhancedPrompt.riskFactors || [],
            estimatedComplexity: enhancedPrompt.estimatedComplexity || 'Medium',
            recommendedTeamSize: enhancedPrompt.recommendedTeamSize || '2-3 people',

            // Additional metadata
            enhancementMetadata: {
                originalConfidence: analysis.confidence,
                projectType: analysis.projectType,
                domain: analysis.domain,
                enhancedFeatures: enhancedPrompt.technicalRequirements?.functionalRequirements || [],
                missingInfoAddressed: analysis.missingCriticalInfo
            }
        };

        return projectData;
    }

    // Helper method to generate project title if not provided
    generateProjectTitle(analysis) {
        const { projectType, domain, extractedInfo } = analysis;

        const typeMap = {
            'mobile app': 'Mobile App',
            'web app': 'Web Application',
            'website': 'Website',
            'marketing': 'Marketing Campaign',
            'research': 'Research Project'
        };

        const domainMap = {
            'social media': 'Social Platform',
            'e-commerce': 'E-commerce Platform',
            'education': 'Educational Platform',
            'healthcare': 'Healthcare Solution',
            'finance': 'Financial Application',
            'entertainment': 'Entertainment App',
            'productivity': 'Productivity Tool'
        };

        const typeStr = typeMap[projectType] || 'Project';
        const domainStr = domainMap[domain] || '';

        if (domainStr) {
            return `${domainStr} ${typeStr}`;
        }

        return `Custom ${typeStr}`;
    }

    // Helper to parse timeline to days
    parseTimelineTodays(extractedTimeline, recommendedTimeline) {
        const timelineStr = extractedTimeline || recommendedTimeline || '30 days';

        // Extract numbers and units
        const match = timelineStr.match(/(\d+)\s*(day|week|month)s?/i);
        if (match) {
            const number = parseInt(match[1]);
            const unit = match[2].toLowerCase();

            switch (unit) {
                case 'day': return number;
                case 'week': return number * 7;
                case 'month': return number * 30;
                default: return 30;
            }
        }

        return 30; // Default to 30 days
    }

    // Helper to calculate due date
    calculateDueDate(timelineDays) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + timelineDays);
        return dueDate.toISOString();
    }

    // Format the response when a project is created
    formatProjectCreationResponse(promptResult, tasksResult) {
        const { projectData, analysis } = promptResult;
        const { subtasks, totalEstimatedHours } = tasksResult;

        let response = `Great! I've analyzed your request and created a comprehensive project plan for your ${projectData.name}.\n\n`;

        // Add enhancement note if prompt was significantly enhanced
        if (analysis.confidence > 0.7) {
            response += `📋 **Enhanced Project Scope**: I've expanded your initial idea with industry best practices and professional project management structure.\n\n`;
        }

        response += `**Project Overview:**\n`;
        response += `• **Timeline**: ${projectData.timeline} days\n`;
        response += `• **Priority**: ${projectData.priority}\n`;
        response += `• **Complexity**: ${projectData.estimatedComplexity}\n`;
        response += `• **Estimated Hours**: ${totalEstimatedHours}h\n`;
        response += `• **Recommended Team**: ${projectData.recommendedTeamSize}\n\n`;

        if (subtasks && subtasks.length > 0) {
            response += `**Task Breakdown** (${subtasks.length} tasks):\n`;
            subtasks.slice(0, 5).forEach((task, index) => {
                response += `${index + 1}. ${task.title} (${task.estimatedHours}h)\n`;
            });

            if (subtasks.length > 5) {
                response += `... and ${subtasks.length - 5} more tasks\n`;
            }
        }

        response += `\n🚀 Ready to start? I can help you refine any aspect of this project plan!`;

        return response;
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

            const parsedResponse = this.extractAndValidateJSON(response);
            const enhancedResponse = this.enhanceTaskResponse(parsedResponse, projectData);

            // Cache successful patterns
            this.projectPatterns.set(cacheKey, enhancedResponse);

            return enhancedResponse;
        } catch (error) {
            console.error('Error generating tasks from AI:', error);
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

${projectData.technicalRequirements ? `
TECHNICAL REQUIREMENTS:
- Functional: ${projectData.technicalRequirements.functionalRequirements?.join(', ') || 'Standard functionality'}
- Non-Functional: ${projectData.technicalRequirements.nonFunctionalRequirements?.join(', ') || 'Standard performance'}
- Constraints: ${projectData.technicalRequirements.technicalConstraints?.join(', ') || 'Standard constraints'}
` : ''}

RESPONSE FORMAT (JSON only):
{
  "subtasks": [
    {
      "title": "Clear, actionable task title (max 80 chars)",
      "description": "Detailed description with specific deliverables",
      "estimatedHours": 4.5,
      "priority": "High|Medium|Low",
      "order": 1,
      "dependencies": [],
      "phase": "Planning|Execution|Review|QA",
      "complexity": "Low|Medium|High"
    }
  ],
  "totalEstimatedHours": 45.5,
  "criticalPath": [0, 2, 4]
}`;
    }

    extractAndValidateJSON(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsedResponse = JSON.parse(jsonMatch[0]);

            if (!parsedResponse.subtasks || !Array.isArray(parsedResponse.subtasks)) {
                throw new Error('Invalid subtasks structure');
            }

            parsedResponse.subtasks.forEach((task, index) => {
                task.estimatedHours = task.estimatedHours || 2;
                task.priority = task.priority || 'Medium';
                task.order = task.order || (index + 1);
                task.dependencies = task.dependencies || [];
            });

            return parsedResponse;
        } catch (error) {
            console.error('JSON parsing error:', error);
            throw new Error('Failed to parse AI response');
        }
    }

    enhanceTaskResponse(parsedResponse, projectData) {
        // Add your existing enhancement logic here
        return parsedResponse;
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

    determineProjectPhase(taskIndex, totalTasks) {
        const progress = (taskIndex + 1) / totalTasks;
        if (progress <= 0.25) return 'Planning';
        if (progress <= 0.8) return 'Execution';
        return 'Review';
    }

    // Method to clear cache periodically
    clearCache() {
        this.projectPatterns.clear();
        console.log('AI Service cache cleared');
    }
}

module.exports = new AIProjectService();