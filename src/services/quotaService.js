// src/services/quotaService.js
class QuotaService {
    constructor() {
        this.quotaConfig = {
            DAILY_API_LIMIT: 45,
            USER_HOURLY_LIMIT: 5,
            GRACE_PERIOD_MINUTES: 30,
            RESET_TIME_UTC: '00:00', // Midnight UTC
        };

        this.quotaStatus = {
            dailyUsed: 0,
            lastResetDate: new Date().toDateString(),
            quotaExhausted: false,
            estimatedResetTime: null
        };

        this.fallbackResponses = this.initializeFallbackResponses();
        this.userNotifications = new Map(); // Track user notifications
    }

    // Enhanced quota checking with detailed status
    checkQuotaStatus() {
        this.checkDailyReset();

        const remaining = this.quotaConfig.DAILY_API_LIMIT - this.quotaStatus.dailyUsed;
        const usagePercentage = (this.quotaStatus.dailyUsed / this.quotaConfig.DAILY_API_LIMIT) * 100;

        return {
            dailyUsed: this.quotaStatus.dailyUsed,
            dailyLimit: this.quotaConfig.DAILY_API_LIMIT,
            remaining: remaining,
            usagePercentage: Math.round(usagePercentage),
            status: this.getQuotaStatusLevel(usagePercentage),
            resetTime: this.getNextResetTime(),
            quotaExhausted: remaining <= 0
        };
    }

    getQuotaStatusLevel(percentage) {
        if (percentage >= 100) return 'EXHAUSTED';
        if (percentage >= 90) return 'CRITICAL';
        if (percentage >= 75) return 'WARNING';
        if (percentage >= 50) return 'MODERATE';
        return 'HEALTHY';
    }

    getNextResetTime() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0); // Set to midnight
        return tomorrow;
    }

    checkDailyReset() {
        const today = new Date().toDateString();
        if (today !== this.quotaStatus.lastResetDate) {
            this.quotaStatus.dailyUsed = 0;
            this.quotaStatus.lastResetDate = today;
            this.quotaStatus.quotaExhausted = false;
            this.userNotifications.clear();
            console.log('✅ Daily quota reset - fresh API calls available');
        }
    }

    // Generate user-friendly quota messages
    generateQuotaMessage(status, userId = null) {
        const quotaInfo = this.checkQuotaStatus();
        const resetTime = this.formatResetTime(quotaInfo.resetTime);

        switch (quotaInfo.status) {
            case 'EXHAUSTED':
                return {
                    message: this.getExhaustedMessage(resetTime),
                    type: 'quota_exhausted',
                    severity: 'error',
                    showAlternatives: true,
                    resetTime: quotaInfo.resetTime,
                    cached: true
                };

            case 'CRITICAL':
                return {
                    message: this.getCriticalMessage(quotaInfo.remaining, resetTime),
                    type: 'quota_critical',
                    severity: 'warning',
                    showAlternatives: false,
                    remaining: quotaInfo.remaining,
                    cached: false
                };

            case 'WARNING':
                return {
                    message: this.getWarningMessage(quotaInfo.remaining),
                    type: 'quota_warning',
                    severity: 'info',
                    showAlternatives: false,
                    remaining: quotaInfo.remaining,
                    cached: false
                };

            default:
                return null; // No quota message needed
        }
    }

    getExhaustedMessage(resetTime) {
        const alternatives = [
            "💡 **What you can still do:**",
            "• Ask basic questions - I have cached responses ready",
            "• Get help with project planning using templates",
            "• Browse your existing projects and tasks",
            "• Use the built-in productivity tools",
            "",
            "🔄 **Full AI features return:** " + resetTime,
            "",
            "**Why the limit?** To keep costs manageable while serving all users fairly. Thank you for understanding! 🙏"
        ];

        return `🤖 **Daily AI Quota Reached**

I've used all ${this.quotaConfig.DAILY_API_LIMIT} daily API calls to keep our service costs sustainable.

${alternatives.join('\n')}`;
    }

    getCriticalMessage(remaining, resetTime) {
        return `⚠️ **Almost out of AI quota** - Only ${remaining} enhanced responses left today.

I'll prioritize the most important requests. Simple questions will use cached responses to save quota.

Quota resets: ${resetTime}`;
    }

    getWarningMessage(remaining) {
        return `📊 **Heads up** - ${remaining} AI responses remaining today. 

I'm still here to help with full functionality!`;
    }

    formatResetTime(resetTime) {
        const now = new Date();
        const reset = new Date(resetTime);
        const hoursUntilReset = Math.ceil((reset - now) / (1000 * 60 * 60));

        if (hoursUntilReset <= 1) {
            const minutesUntilReset = Math.ceil((reset - now) / (1000 * 60));
            return `in ${minutesUntilReset} minutes`;
        } else if (hoursUntilReset < 24) {
            return `in ${hoursUntilReset} hours`;
        } else {
            return reset.toLocaleString('en-US', {
                weekday: 'long',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short'
            });
        }
    }

    // Enhanced fallback responses for when quota is exhausted
    initializeFallbackResponses() {
        return new Map([
            // Project management help
            ['project', "I can help you organize projects even without AI! Try breaking your project into these phases: Planning (20%), Development (60%), Testing (15%), and Deployment (5%). What's your project about?"],

            ['task', "Here's a quick task breakdown method: 1) Write down your main goal, 2) List 3-5 major steps, 3) Break each step into 2-4 smaller tasks, 4) Estimate time for each. What are you trying to accomplish?"],

            ['deadline', "For deadline management: Work backwards from your due date, add 20% buffer time, identify critical path tasks, and prioritize high-impact activities. When's your deadline?"],

            ['planning', "Good planning saves time! Use the 5W method: What (goals), Why (purpose), When (timeline), Where (resources), Who (team). I can help you work through each area."],

            // Productivity tips
            ['productivity', "Productivity tips that always work: 1) Time-blocking your calendar, 2) The 2-minute rule (do it now if <2min), 3) Batch similar tasks, 4) Regular breaks every 90min. Which area interests you?"],

            ['organize', "Organization made simple: Create 3 main folders/categories, use consistent naming, review weekly, and keep a 'quick capture' inbox. What do you need to organize?"],

            ['priority', "Priority framework: High = Urgent + Important, Medium = Important but not urgent, Low = Neither urgent nor important. Defer or delete the rest. What tasks are you prioritizing?"],

            // Encouragement and support
            ['help', "I'm still here to help! Even without AI enhancement, I can provide guidance on project management, productivity techniques, and organizational strategies. What's your challenge?"],

            ['motivation', "Remember: Progress over perfection! Every small step counts. Break big goals into tiny wins, celebrate progress, and keep momentum going. You've got this! 💪"],

            ['stuck', "Feeling stuck? Try the 'Next smallest step' approach: What's one tiny action you can take in the next 5 minutes? Sometimes the smallest step unlocks everything else."],

            // Default responses
            ['hello', "Hello! I'm running on cached responses right now (daily AI quota reached), but I can still help with project planning, productivity tips, and organizational strategies. What's on your mind?"],

            ['thank', "You're welcome! I'm happy to help however I can, even with limited AI calls. Feel free to ask about project management, time management, or productivity techniques anytime!"]
        ]);
    }

    // Smart fallback response selection
    getFallbackResponse(userMessage) {
        const message = userMessage.toLowerCase().trim();

        // Check for exact matches first
        for (const [pattern, response] of this.fallbackResponses) {
            if (message.includes(pattern)) {
                return {
                    message: response,
                    type: 'quota_fallback',
                    pattern: pattern,
                    cached: true,
                    alternatives: this.getSuggestedActions()
                };
            }
        }

        // Default fallback with helpful suggestions
        return {
            message: this.getDefaultFallbackMessage(),
            type: 'quota_fallback',
            cached: true,
            alternatives: this.getSuggestedActions()
        };
    }

    getDefaultFallbackMessage() {
        const resetTime = this.formatResetTime(this.getNextResetTime());

        return `🤖 I've reached my daily AI limit, but I can still help!

**Available right now:**
• Project planning templates and frameworks
• Productivity tips and time management strategies  
• Task organization and priority setting guidance
• General project management advice

**Full AI features return:** ${resetTime}

What would you like help with? I'll do my best with the tools I have! 😊`;
    }

    getSuggestedActions() {
        return [
            {
                action: "Browse Templates",
                description: "Check out project templates and frameworks",
                icon: "📋"
            },
            {
                action: "Productivity Tips",
                description: "Get time management and efficiency strategies",
                icon: "⚡"
            },
            {
                action: "Planning Guide",
                description: "Step-by-step project planning assistance",
                icon: "🗺️"
            },
            {
                action: "Quick Reference",
                description: "Essential project management principles",
                icon: "📚"
            }
        ];
    }

    // Track user notifications to avoid spam
    shouldNotifyUser(userId, notificationType) {
        const key = `${userId}_${notificationType}`;
        const lastNotification = this.userNotifications.get(key);
        const cooldownMinutes = 30;

        if (!lastNotification) {
            this.userNotifications.set(key, Date.now());
            return true;
        }

        const timeSinceLastNotification = Date.now() - lastNotification;
        const cooldownPassed = timeSinceLastNotification > (cooldownMinutes * 60 * 1000);

        if (cooldownPassed) {
            this.userNotifications.set(key, Date.now());
            return true;
        }

        return false;
    }

    // Generate quota dashboard data
    getQuotaDashboard() {
        const quotaInfo = this.checkQuotaStatus();
        const resetTime = this.getNextResetTime();

        return {
            current: quotaInfo,
            timeline: {
                resetTime: resetTime,
                resetIn: this.formatResetTime(resetTime),
                nextQuotaAmount: this.quotaConfig.DAILY_API_LIMIT
            },
            recommendations: this.getUsageRecommendations(quotaInfo),
            alternatives: quotaInfo.quotaExhausted ? this.getSuggestedActions() : null
        };
    }

    getUsageRecommendations(quotaInfo) {
        const recommendations = [];

        if (quotaInfo.status === 'CRITICAL' || quotaInfo.status === 'EXHAUSTED') {
            recommendations.push({
                type: 'conservation',
                title: 'Save remaining quota',
                description: 'Use cached responses for simple questions to preserve AI calls for complex tasks'
            });
        }

        if (quotaInfo.usagePercentage > 50) {
            recommendations.push({
                type: 'optimization',
                title: 'Batch your requests',
                description: 'Group related questions together to make the most of each AI interaction'
            });
        }

        recommendations.push({
            type: 'scheduling',
            title: 'Plan ahead',
            description: `Quota resets ${this.formatResetTime(this.getNextResetTime())}. Save complex requests for after reset if possible.`
        });

        return recommendations;
    }

    // Integration method for the AI service
    handleQuotaExceeded(userMessage, userId) {
        const quotaMessage = this.generateQuotaMessage('EXHAUSTED', userId);
        const fallbackResponse = this.getFallbackResponse(userMessage);

        // Combine quota warning with helpful fallback
        return {
            message: fallbackResponse.message,
            type: 'quota_exhausted',
            severity: 'error',
            cached: true,
            quotaInfo: quotaMessage,
            alternatives: fallbackResponse.alternatives,
            resetTime: this.getNextResetTime(),
            showUpgrade: false, // Set to true if you have premium plans
            metadata: {
                dailyUsed: this.quotaStatus.dailyUsed,
                dailyLimit: this.quotaConfig.DAILY_API_LIMIT,
                pattern: fallbackResponse.pattern || 'default'
            }
        };
    }
}

// Export singleton instance
module.exports = new QuotaService();