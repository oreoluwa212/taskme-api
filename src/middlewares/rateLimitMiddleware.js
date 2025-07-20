// src/routes/usageRoutes.js
const express = require('express');
const router = express.Router();
const aiChatService = require('../services/aiChatService');

// Get current usage statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = aiChatService.getUsageStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test AI service connection and usage
router.get('/test', async (req, res) => {
    try {
        const testResult = await aiChatService.testConnection();
        res.json({
            success: true,
            data: testResult
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Clear cache (useful for testing)
router.post('/clear-cache', async (req, res) => {
    try {
        aiChatService.clearCache();
        res.json({
            success: true,
            message: 'Cache cleared successfully',
            data: aiChatService.getUsageStats()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Process multiple requests in batch (useful for bulk operations)
router.post('/batch', async (req, res) => {
    try {
        const { requests } = req.body;

        if (!requests || !Array.isArray(requests)) {
            return res.status(400).json({
                success: false,
                error: 'Requests array is required'
            });
        }

        if (requests.length > 10) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 10 requests per batch'
            });
        }

        const results = await aiChatService.batchProcessRequests(requests);

        res.json({
            success: true,
            data: {
                results,
                processed: results.length,
                usage: aiChatService.getUsageStats()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;

// ===== MIDDLEWARE =====

// src/middleware/rateLimitMiddleware.js - Add this to your existing middleware
const rateLimitMiddleware = (req, res, next) => {
    // Extract user ID from request (adjust based on your auth system)
    const userId = req.user?.id || req.body?.userId || req.ip;

    // Add userId to request context for the AI service
    req.aiContext = {
        ...req.aiContext,
        userId: userId
    };

    next();
};

// src/middleware/usageMiddleware.js - Track API usage
const usageMiddleware = (req, res, next) => {
    const originalSend = res.send;
    const startTime = Date.now();

    res.send = function (data) {
        const duration = Date.now() - startTime;

        // Log usage data (you can save this to database)
        console.log({
            timestamp: new Date().toISOString(),
            endpoint: req.path,
            method: req.method,
            userId: req.aiContext?.userId || 'anonymous',
            duration: duration,
            response_length: data ? data.length : 0
        });

        originalSend.call(this, data);
    };

    next();
};

module.exports = {
    router,
    rateLimitMiddleware,
    usageMiddleware
};