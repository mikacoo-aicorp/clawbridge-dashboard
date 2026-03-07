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
        gatewaySystem: {
            enabled: true,
            title: 'System Status',
            icon: '⚡',
            order: 1
        },
        apiAgents: {
            enabled: true,
            title: 'API & Agent Stats',
            icon: '📊',
            order: 2
        },
        cron: {
            enabled: true,
            title: 'Cron Jobs',
            icon: '⏰',
            order: 3
        },
        knowledge: {
            enabled: true,
            title: 'Knowledge Base',
            icon: '📚',
            order: 4
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
