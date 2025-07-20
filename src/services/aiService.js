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
  // =========================
  // ==== CHAT METHODS FIRST =
  // =========================

  // Main method to intercept and enhance user prompts
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

  // All your existing methods (generateProjectTasks, buildProjectTaskPrompt, etc.) go here...
  // I'll keep the core functionality from your original service

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

  generateFallbackTasks(projectData) {
    // Your existing fallback logic
    return {
      subtasks: [],
      totalEstimatedHours: 0,
      fallbackUsed: true
    };
  }

  generateCacheKey(projectData) {
    const characteristics = [
      projectData.category || 'general',
      projectData.priority,
      Math.floor(projectData.timeline / 7),
      projectData.description.length > 100 ? 'detailed' : 'simple'
    ];
    return characteristics.join('_');
  }

  adaptCachedPattern(cachedPattern, projectData) {
    const adapted = JSON.parse(JSON.stringify(cachedPattern));
    return adapted;
  }

  async generateChatResponse(userMessage, context = {}) {
    // Your existing chat response logic
    return {
      message: `I understand you're asking about "${userMessage}". How can I help you with your project management needs?`,
      type: 'general_chat'
    };
  }

  generateFallbackChatResponse(userMessage) {
    return {
      message: `I'd be happy to help with your request: "${userMessage}". Could you provide more details so I can assist you better?`,
      type: 'fallback',
      error: true
    };
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

  async generateChatResponse(userMessage, context = {}) {
    try {
      // Step 1: Analyze user intent and extract context
      const intentAnalysis = await this.analyzeUserIntent(userMessage, context);

      // Step 2: Enhance the prompt based on intent
      const enhancedPrompt = this.buildEnhancedPrompt(userMessage, intentAnalysis, context);

      // Step 3: Generate response with enhanced prompt
      const result = await this.model.generateContent(enhancedPrompt);
      const response = result.response.text();

      // Step 4: Post-process response if needed
      return this.postProcessChatResponse(response, intentAnalysis, context);

    } catch (error) {
      console.error('Error generating enhanced chat response:', error);
      return this.generateFallbackChatResponse(userMessage);
    }
  }

  // Analyze user intent and extract missing context
  async analyzeUserIntent(userMessage, context = {}) {
    const analysisPrompt = `
Analyze this user message for project management context and intent:

User Message: "${userMessage}"
Available Context: ${JSON.stringify(context, null, 2)}

Determine:
1. Primary intent (project_creation, task_management, consultation, general_question, etc.)
2. Specificity level (vague, moderate, specific)
3. Missing information that would help provide a better response
4. Whether this relates to project management or general productivity

Respond with JSON:
{
  "intent": "primary_intent",
  "specificity": "vague|moderate|specific",
  "category": "project_management|productivity|consultation|general",
  "missingInfo": ["list of missing details that would improve response"],
  "detectedEntities": {
    "projectName": "extracted project name or null",
    "timeline": "extracted timeline or null", 
    "priority": "extracted priority or null",
    "taskCount": "number if mentioned or null",
    "teamSize": "team size if mentioned or null",
    "budget": "budget if mentioned or null"
  },
  "suggestedQuestions": ["clarifying questions to ask user"],
  "contextualHints": ["hints about what user might actually want"],
  "responseType": "direct_answer|guided_questions|project_template|consultation"
}`;

    try {
      const result = await this.model.generateContent(analysisPrompt);
      const response = result.response.text();

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error analyzing user intent:', error);
    }

    // Fallback analysis
    return {
      intent: "general_question",
      specificity: "moderate",
      category: "general",
      missingInfo: [],
      detectedEntities: {},
      suggestedQuestions: [],
      contextualHints: [],
      responseType: "direct_answer"
    };
  }

  // Build enhanced prompt based on analysis
  buildEnhancedPrompt(originalMessage, analysis, context) {
    const systemContext = this.buildSystemContext(analysis, context);
    const userGuidance = this.buildUserGuidance(analysis);
    const exampleContext = this.buildExampleContext(analysis);

    return `${systemContext}

${userGuidance}

${exampleContext}

User's original message: "${originalMessage}"

Based on the analysis:
- Intent: ${analysis.intent}
- Specificity: ${analysis.specificity}
- Missing info: ${analysis.missingInfo.join(', ') || 'None identified'}
- Response type needed: ${analysis.responseType}

${analysis.contextualHints.length > 0 ?
        `Context hints: ${analysis.contextualHints.join('; ')}` : ''}

Please provide a helpful, detailed response. If information is missing for a complete answer, ask specific clarifying questions and provide partial guidance based on what's available.`;
  }

  buildSystemContext(analysis, context) {
    const baseContext = `You are an expert project management AI assistant. Your role is to help users with:
- Project planning and breakdown
- Task management and prioritization  
- Resource allocation and timeline estimation
- Risk assessment and mitigation strategies
- Team coordination and workflow optimization
- Productivity best practices`;

    const intentSpecificContext = {
      project_creation: `

Focus on PROJECT CREATION:
- Help define scope and requirements
- Break down complex projects into phases
- Suggest realistic timelines and resource needs
- Identify potential risks and dependencies
- Provide actionable next steps`,

      task_management: `

Focus on TASK MANAGEMENT:
- Break complex tasks into smaller, actionable items
- Suggest task prioritization frameworks (Eisenhower Matrix, MoSCoW, etc.)
- Recommend time estimation techniques
- Identify task dependencies and sequencing
- Provide productivity tips for task execution`,

      consultation: `

Focus on PROJECT CONSULTATION:
- Provide strategic project management advice
- Suggest industry best practices and methodologies
- Help troubleshoot project challenges
- Recommend tools and processes for improvement
- Offer insights on team management and stakeholder communication`,

      general_question: `

Provide COMPREHENSIVE GUIDANCE:
- Answer the user's specific question thoroughly
- Provide relevant context and background
- Suggest related considerations they might not have thought of
- Offer actionable next steps
- Include best practices and common pitfalls to avoid`
    };

    return baseContext + (intentSpecificContext[analysis.intent] || intentSpecificContext.general_question);
  }

  buildUserGuidance(analysis) {
    if (analysis.specificity === 'vague') {
      return `
The user's request is somewhat vague. In your response:
1. Provide the best answer possible with available information
2. Ask 2-3 specific clarifying questions to better understand their needs
3. Offer multiple approaches or options they might consider
4. Give examples to illustrate your points
5. Suggest what additional information would help provide more targeted advice`;
    }

    if (analysis.specificity === 'moderate') {
      return `
The user has provided moderate detail. In your response:
1. Address their specific question directly
2. Ask 1-2 clarifying questions if needed for optimization
3. Provide comprehensive guidance with examples
4. Suggest related considerations they should think about
5. Offer concrete next steps`;
    }

    return `
The user has provided specific information. In your response:
1. Give a detailed, actionable answer
2. Address all aspects of their question
3. Provide specific recommendations and best practices
4. Include implementation steps and considerations
5. Anticipate follow-up questions and provide relevant context`;
  }

  buildExampleContext(analysis) {
    const examples = {
      project_creation: `
Example response structure for project creation:
- Acknowledge their project idea
- Ask clarifying questions about scope, timeline, resources
- Break down the project into major phases
- Suggest specific tasks for the first phase
- Recommend tools, methodologies, or frameworks
- Identify potential challenges and mitigation strategies`,

      task_management: `
Example response structure for task management:
- Understand their current task challenges
- Suggest task breakdown approaches (WBS, user stories, etc.)
- Recommend prioritization methods
- Provide time estimation techniques
- Suggest task tracking and progress monitoring methods
- Offer productivity tips and workflow optimization`,

      consultation: `
Example response structure for consultation:
- Understand the specific challenge or decision they're facing
- Provide strategic recommendations based on best practices
- Explain the reasoning behind your suggestions
- Offer multiple approaches or alternatives
- Suggest implementation strategies and change management tips
- Recommend additional resources or learning materials`
    };

    return examples[analysis.intent] || examples.consultation;
  }

  // Post-process the response to add structured elements
  postProcessChatResponse(response, analysis, context) {
    const processedResponse = {
      message: response,
      intent: analysis.intent,
      responseType: analysis.responseType,
      metadata: {
        specificity: analysis.specificity,
        category: analysis.category,
        detectedEntities: analysis.detectedEntities
      }
    };

    // Add structured follow-up suggestions
    if (analysis.suggestedQuestions.length > 0) {
      processedResponse.suggestedQuestions = analysis.suggestedQuestions;
    }

    // Add quick actions based on intent
    processedResponse.quickActions = this.generateQuickActions(analysis, context);

    return processedResponse;
  }

  generateQuickActions(analysis, context) {
    const actions = [];

    switch (analysis.intent) {
      case 'project_creation':
        actions.push(
          { type: 'create_project', label: 'Create New Project', enabled: true },
          { type: 'project_template', label: 'Browse Project Templates', enabled: true },
          { type: 'requirements_wizard', label: 'Requirements Gathering Wizard', enabled: true }
        );
        break;

      case 'task_management':
        actions.push(
          { type: 'task_breakdown', label: 'Break Down Tasks', enabled: !!analysis.detectedEntities.projectName },
          { type: 'prioritization_help', label: 'Help Prioritize Tasks', enabled: true },
          { type: 'time_estimation', label: 'Estimate Task Times', enabled: true }
        );
        break;

      case 'consultation':
        actions.push(
          { type: 'best_practices', label: 'View Best Practices', enabled: true },
          { type: 'risk_assessment', label: 'Risk Assessment Tool', enabled: true },
          { type: 'methodology_guide', label: 'Methodology Recommendations', enabled: true }
        );
        break;

      default:
        actions.push(
          { type: 'create_project', label: 'Create Project', enabled: true },
          { type: 'general_help', label: 'General PM Help', enabled: true }
        );
    }

    return actions;
  }

  // Fallback response for errors
  generateFallbackChatResponse(originalMessage) {
    return {
      message: `I understand you're asking about "${originalMessage}". I'm experiencing some technical difficulties, but I'd still like to help you with your project management needs.

Could you tell me:
1. Are you looking to create a new project?
2. Do you need help managing existing tasks?
3. Are you seeking general project management advice?

In the meantime, here are some quick tips:
- Break large projects into smaller, manageable tasks
- Set clear deadlines and priorities
- Regular check-ins help maintain momentum
- Document important decisions and changes

Please try rephrasing your question, and I'll do my best to provide more specific guidance.`,
      intent: 'general_question',
      responseType: 'direct_answer',
      metadata: { error: true, fallback: true },
      quickActions: [
        { type: 'create_project', label: 'Create New Project', enabled: true },
        { type: 'general_help', label: 'General PM Help', enabled: true }
      ]
    };
  }

  // Smart conversation context builder
  buildConversationContext(chatHistory, maxMessages = 5) {
    if (!chatHistory || chatHistory.length === 0) {
      return '';
    }

    const recentMessages = chatHistory.slice(-maxMessages);
    const contextItems = [];

    recentMessages.forEach((msg, index) => {
      if (msg.sender === 'user') {
        contextItems.push(`User previously mentioned: "${msg.content}"`);
      } else if (msg.sender === 'assistant' && msg.intent) {
        contextItems.push(`I previously helped with: ${msg.intent} - "${msg.content.substring(0, 100)}..."`);
      }
    });

    return contextItems.length > 0 ?
      `\n\nConversation context:\n${contextItems.join('\n')}` : '';
  }

  // Method to suggest follow-up questions based on conversation
  async generateFollowUpSuggestions(conversation, userProfile = {}) {
    const lastUserMessage = conversation.filter(msg => msg.sender === 'user').slice(-1)[0];
    const lastAIResponse = conversation.filter(msg => msg.sender === 'assistant').slice(-1)[0];

    if (!lastUserMessage || !lastAIResponse) {
      return [];
    }

    const prompt = `
Based on this conversation, suggest 3 relevant follow-up questions the user might want to ask:

Last user message: "${lastUserMessage.content}"
My response intent: ${lastAIResponse.intent || 'general'}
User profile: ${JSON.stringify(userProfile)}

Suggest questions that would:
1. Help them dive deeper into the topic
2. Address practical implementation concerns
3. Explore related project management areas

Format as JSON array of strings:
["Question 1", "Question 2", "Question 3"]`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error generating follow-up suggestions:', error);
    }

    return [
      "How can I implement this in my current project?",
      "What tools would you recommend for this?",
      "What are the common challenges with this approach?"
    ];
  }

  // Enhanced method for detecting project creation intent
  async detectProjectCreationIntent(message, context = {}) {
    const detectionPrompt = `
Analyze if this message indicates the user wants to create a project:

Message: "${message}"
Context: ${JSON.stringify(context)}

Look for indicators like:
- Describing a goal or objective they want to achieve
- Mentioning work that needs to be organized
- Asking for help planning or structuring something
- Describing a problem that needs a systematic approach
- Using words like "project", "plan", "organize", "build", "create", "develop"

Respond with JSON:
{
  "isProjectCreation": true/false,
  "confidence": 0.1-1.0,
  "extractedInfo": {
    "goal": "what they want to achieve",
    "scope": "rough scope if detectable", 
    "timeline": "timeline if mentioned",
    "domain": "area/industry if detectable"
  },
  "nextSteps": ["suggested questions to ask them"]
}`;

    try {
      const result = await this.model.generateContent(detectionPrompt);
      const response = result.response.text();

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error detecting project creation intent:', error);
    }

    return {
      isProjectCreation: false,
      confidence: 0,
      extractedInfo: {},
      nextSteps: []
    };
  }

  // Build system prompt based on chat type
  buildChatSystemPrompt(chatType) {
    const basePrompt = `You are a helpful AI assistant specializing in project management and productivity. You help users:
- Break down complex projects into manageable tasks
- Provide project management advice and best practices
- Create detailed project plans with timelines
- Suggest task prioritization strategies
- Offer productivity tips and workflow optimization

Be conversational, helpful, and specific in your responses. When users mention wanting to create projects or need help with task breakdown, offer concrete assistance.`;

    const typeSpecificPrompts = {
      general: basePrompt,
      project_creation: `${basePrompt}

You're specifically helping with project creation. When users describe a project idea:
1. Ask clarifying questions if needed
2. Help them define scope and requirements  
3. Suggest realistic timelines
4. Offer to help break it into tasks
5. Provide project management best practices`,

      task_generation: `${basePrompt}

You're helping with task generation and breakdown. Focus on:
1. Breaking complex work into smaller, actionable tasks
2. Suggesting task dependencies and ordering
3. Estimating time requirements realistically
4. Identifying potential risks or blockers
5. Recommending task prioritization methods`,

      consultation: `${basePrompt}

You're providing project management consultation. Offer strategic advice on:
1. Project planning and execution strategies
2. Resource allocation and team management
3. Risk assessment and mitigation
4. Quality assurance processes
5. Project monitoring and control methods`
    };

    return typeSpecificPrompts[chatType] || typeSpecificPrompts.general;
  }

  // Extract project information from chat message
  async extractProjectInfo(message) {
    const extractionPrompt = `
Analyze this user message and extract project information. If the user is describing a project they want to create, extract the details.

User message: "${message}"

Extract and return ONLY a JSON object with these fields (use null if information is not provided):
{
  "title": "project title or null",
  "description": "detailed description or null", 
  "timeline": number_of_days_or_null,
  "priority": "High/Medium/Low or null",
  "category": "category or null",
  "isProjectRequest": true/false,
  "suggestedTitle": "suggested title if title is null",
  "suggestedDescription": "suggested description if description is null",
  "clarificationNeeded": ["list of things that need clarification"]
}`;

    try {
      const result = await this.model.generateContent(extractionPrompt);
      const response = result.response.text();

      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        isProjectRequest: false,
        clarificationNeeded: []
      };
    } catch (error) {
      console.error('Error extracting project info:', error);
      return {
        isProjectRequest: false,
        clarificationNeeded: []
      };
    }
  }

  // Generate project creation suggestions
  async generateProjectSuggestions(userInput, context = {}) {
    const prompt = `
Based on the user's input and context, suggest 3 different project ideas with brief descriptions.

User input: "${userInput}"
Context: ${JSON.stringify(context)}

Respond with a JSON array of project suggestions:
[
  {
    "title": "Project Title",
    "description": "Brief description of the project",
    "estimatedDuration": "2-3 weeks",
    "complexity": "Low/Medium/High",
    "category": "Development/Marketing/Research/etc"
  }
]`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return [];
    } catch (error) {
      console.error('Error generating project suggestions:', error);
      return [];
    }
  }

  // Smart response routing
  async routeChatMessage(message, chatHistory = []) {
    const routingPrompt = `
Analyze this message and determine the best response type:

Message: "${message}"

Determine if this message is asking for:
1. project_creation - wants to create a new project
2. task_help - needs help with task breakdown or management
3. general_advice - general project management advice
4. clarification - asking for more details about something
5. casual - casual conversation

Respond with just the category name.`;

    try {
      const result = await this.model.generateContent(routingPrompt);
      const category = result.response.text().trim().toLowerCase();

      return ['project_creation', 'task_help', 'general_advice', 'clarification', 'casual']
        .includes(category) ? category : 'general_advice';
    } catch (error) {
      console.error('Error routing chat message:', error);
      return 'general_advice';
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