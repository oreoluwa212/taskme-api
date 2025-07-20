// src/services/aiService.js
const aiChatService = require('./aiChatService');

// Create a unified service object that provides both direct method access
// and service-specific access for better flexibility
const aiService = {
  // Direct access to chat service instance
  aiChatService,

  // === Direct method exports for easier access ===
  // These are properly bound to maintain 'this' context

  // Chat-related methods
  generateChatResponse: aiChatService.generateChatResponse.bind(aiChatService),
  extractProjectFromConversation: aiChatService.extractProjectFromConversation.bind(aiChatService),
  
  // Project task generation - this is the key method used by subtaskController
  generateProjectTasks: aiChatService.generateProjectTasks.bind(aiChatService),

  // Utility methods
  getUsageStats: aiChatService.getUsageStats.bind(aiChatService),
  testConnection: aiChatService.testConnection.bind(aiChatService),
  clearCache: aiChatService.clearCache.bind(aiChatService),

  // === Service health check method ===
  async healthCheck() {
    try {
      const chatServiceHealth = await aiChatService.testConnection();
      return {
        status: 'healthy',
        services: {
          chat: chatServiceHealth
        },
        availableMethods: [
          'generateChatResponse',
          'generateProjectTasks',
          'extractProjectFromConversation',
          'getUsageStats',
          'testConnection',
          'clearCache'
        ]
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        fallbackAvailable: true
      };
    }
  },

  // === Convenience method to check if generateProjectTasks is available ===
  isProjectTaskGenerationAvailable() {
    return typeof aiChatService.generateProjectTasks === 'function';
  },

  // === Additional helper methods ===
  
  // Wrapper for project analysis using existing extractProjectFromConversation
  async analyzeForProjectCreation(messages, context = {}) {
    try {
      const projectData = aiChatService.extractProjectFromConversation(messages);
      if (projectData && projectData.hasProject) {
        return {
          hasProject: true,
          confidence: 0.8, // Since we're using rule-based detection
          projectData: projectData,
          suggestions: [
            'Consider breaking down the project into smaller milestones',
            'Set realistic timelines based on complexity',
            'Identify potential risks early'
          ]
        };
      }
      return {
        hasProject: false,
        confidence: 0.1,
        reason: 'No clear project indicators found in conversation'
      };
    } catch (error) {
      console.error('Error in analyzeForProjectCreation:', error);
      return {
        hasProject: false,
        confidence: 0,
        error: error.message
      };
    }
  },

  // Wrapper for extracting project data with enhanced validation
  async extractProjectData(userMessage, context = {}) {
    try {
      // Create a mock messages array if only userMessage is provided
      const messages = context.messages || [
        {
          sender: 'user',
          content: userMessage,
          timestamp: new Date().toISOString()
        }
      ];

      const projectData = aiChatService.extractProjectFromConversation(messages);
      
      if (projectData && projectData.hasProject) {
        // Add some additional validation and enhancement
        return {
          ...projectData,
          extractionMethod: 'rule-based',
          confidence: this.calculateProjectConfidence(projectData),
          validatedAt: new Date().toISOString()
        };
      }

      return null;
    } catch (error) {
      console.error('Error in extractProjectData:', error);
      return null;
    }
  },

  // Helper method to calculate project confidence score
  calculateProjectConfidence(projectData) {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on available data
    if (projectData.title && projectData.title.length > 5) confidence += 0.1;
    if (projectData.description && projectData.description.length > 20) confidence += 0.1;
    if (projectData.category && projectData.category !== 'Other') confidence += 0.1;
    if (projectData.tags && projectData.tags.length > 0) confidence += 0.1;
    if (projectData.timeline && projectData.timeline > 0) confidence += 0.1;
    
    return Math.min(confidence, 0.9); // Cap at 0.9 since it's rule-based
  }
};

// Bind the new methods to maintain context
aiService.analyzeForProjectCreation = aiService.analyzeForProjectCreation.bind(aiService);
aiService.extractProjectData = aiService.extractProjectData.bind(aiService);

// Additional validation to ensure critical methods exist
const requiredMethods = ['generateProjectTasks', 'generateChatResponse', 'extractProjectFromConversation'];
const missingMethods = requiredMethods.filter(method => typeof aiService[method] !== 'function');

if (missingMethods.length > 0) {
  console.error('CRITICAL: Missing required methods:', missingMethods);
  console.error('Available methods:', Object.keys(aiService).filter(key => typeof aiService[key] === 'function'));
} else {
  console.log('✓ All required AI service methods are available');
}

// Export the unified service
module.exports = aiService;