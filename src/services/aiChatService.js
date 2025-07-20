// src/services/aiChatService.js - Simplified version
const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIChatService {
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
    }

    // Main chat response generation
    async generateChatResponse(userMessage, context = {}) {
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
            console.error('Error generating chat response:', error);
            return {
                message: "I'm here to help! Could you tell me more about what you're working on or what you'd like to accomplish?",
                type: 'fallback'
            };
        }
    }

    // Enhanced chat response with project detection
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
            console.error('Error generating enhanced chat response:', error);
            return await this.generateChatResponse(userMessage, context);
        }
    }

    // Analyze if user message contains project creation intent
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
            console.error('Error analyzing project creation:', error);
        }

        return { isProjectRequest: false, confidence: 0, reasoning: "Analysis failed" };
    }

    // Extract project data from user message
    async extractProjectData(message) {
        const extractionPrompt = `
Based on this user message, extract project information and provide smart defaults:

User message: "${message}"

Create a comprehensive project structure. If specific information is not provided, use intelligent defaults.

Respond with JSON only:
{
  "title": "clear project title",
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
            console.error('Error extracting project data:', error);
        }

        // Fallback project data
        const today = new Date();
        const dueDate = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

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

    // Generate project tasks
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
            const jsonMatch = response.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const tasksResponse = JSON.parse(jsonMatch[0]);

                // Add dates to tasks if missing
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

    // Format project creation response message
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

    // Build conversation context from recent messages
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
}

module.exports = new AIChatService();