// src/services/aiService.js
const aiChatService = require('./aiChatService');
const aiProjectService = require('./aiProjectService');

// Create a unified service object that provides both direct method access
// and service-specific access for better flexibility
const aiService = {
  // Direct access to chat service instance
  aiChatService,

  // Direct access to project service instance  
  aiProjectService,

  // === Direct method exports for easier access ===
  // These are properly bound to maintain 'this' context

  // Chat-related methods
  generateChatResponse: aiChatService.generateChatResponse.bind(aiChatService),
  extractProjectFromConversation: aiChatService.extractProjectFromConversation.bind(aiChatService),
  analyzeForProjectCreation: aiChatService.analyzeForProjectCreation.bind(aiChatService),
  extractProjectData: aiChatService.extractProjectData.bind(aiChatService),

  // Project task generation - this is the key method used by subtaskController
  generateProjectTasks: aiChatService.generateProjectTasks.bind(aiChatService),

  // Utility methods
  getUsageStats: aiChatService.getUsageStats.bind(aiChatService),
  testConnection: aiChatService.testConnection.bind(aiChatService),

  // === Service health check method ===
  async healthCheck() {
    try {
      const chatServiceHealth = await aiChatService.testConnection();
      return {
        status: 'healthy',
        services: {
          chat: chatServiceHealth,
          project: 'available'
        },
        availableMethods: [
          'generateChatResponse',
          'generateProjectTasks',
          'extractProjectFromConversation',
          'analyzeForProjectCreation',
          'extractProjectData',
          'getUsageStats',
          'testConnection'
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
  }
};

// Additional validation to ensure critical methods exist
if (!aiService.generateProjectTasks) {
  console.error('CRITICAL: generateProjectTasks method not properly bound');
  console.error('Available methods:', Object.keys(aiService));
}

// Export the unified service
module.exports = aiService;