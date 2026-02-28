// ClawBridge Dashboard Configuration

const CONFIG = {
    // Gateway API configuration
    gateway: {
        baseUrl: 'http://localhost:18789',
        token: '', // Will be fetched dynamically or set manually
        refreshInterval: 30000, // 30 seconds for full dashboard
        systemRefreshInterval: 12000, // 12 seconds for system overview
        usageRefreshInterval: 30000 // 30 seconds for usage
    },
    
    // Module configuration - enable/disable modules here
    modules: {
        health: {
            enabled: true,
            title: 'Gateway',
            icon: '🌐',
            order: 1
        },
        system: {
            enabled: true,
            title: 'System Overview',
            icon: '⚡',
            order: 2
        },
        usage: {
            enabled: true,
            title: 'API Usage',
            icon: '💰',
            order: 3
        },
        status: {
            enabled: true,
            title: 'Agents & Sessions',
            icon: '🤖',
            order: 4
        },
        cron: {
            enabled: true,
            title: 'Cron Jobs',
            icon: '⏰',
            order: 5
        },
        knowledge: {
            enabled: true,
            title: 'Knowledge Base',
            icon: '📚',
            order: 6
        }
    },
    
    // UI Configuration
    ui: {
        theme: 'dark',
        showTimestamps: true,
        maxSessions: 5,
        maxAgents: 10
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
