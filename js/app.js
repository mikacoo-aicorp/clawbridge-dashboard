// Nexus Dashboard - Main Application

class NexusDashboard {
    constructor() {
        this.data = {};
        this.modules = {};
        this.apiBase = ''; // Will be set automatically
        this.cronPreviousJobs = [];
        this.cronHasSnapshot = false;
        this.init();
    }

    async init() {
        console.log('🚀 Nexus Dashboard initializing...');
        this.detectBaseUrl();
        this.renderModules();
        await this.fetchAllData();
        await this.fetchUsageData();
        this.startAutoRefresh();
        this.updateTimestamp();
        
        // Initial system info
        this.fetchSystemInfo();
    }

    detectBaseUrl() {
        // Detect if we're on a specific port or root
        const port = window.location.port;
        this.apiBase = port === '3000' || port === '3001' ? '' : '';
    }

    // Render module containers
    renderModules() {
        const dashboard = document.getElementById('dashboard');
        dashboard.innerHTML = '';

        // Sort modules by order
        const sortedModules = Object.entries(CONFIG.modules)
            .filter(([key, mod]) => mod.enabled)
            .sort((a, b) => a[1].order - b[1].order);

        sortedModules.forEach(([key, mod]) => {
            const moduleEl = document.createElement('div');
            moduleEl.className = 'module';
            moduleEl.id = `module-${key}`;
            moduleEl.innerHTML = `
                <div class="module-header">
                    <div class="module-title">
                        <span class="icon">${mod.icon}</span>
                        <span>${mod.title}</span>
                    </div>
                    <span class="module-badge">Loading</span>
                </div>
                <div class="module-content">
                    <div class="spinner"></div>
                </div>
            `;
            dashboard.appendChild(moduleEl);
        });
    }

    // Fetch all data from APIs
    async fetchAllData() {
        const endpoints = [
            { key: 'health', url: '/api/gateway/health' },
            { key: 'version', url: '/api/version' },
            { key: 'status', url: '/api/gateway/status' },
            { key: 'system', url: '/api/system' },
            { key: 'knowledge', url: '/api/knowledge' },
            { key: 'cron', url: '/api/cron' }
        ];

        await Promise.allSettled(endpoints.map(async ({ key, url }) => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                this.data[key] = data;
                this.renderModule(key, data);
            } catch (error) {
                console.error(`Error fetching ${key}:`, error);
                this.renderError(key, error.message);
            }
        }));
    }

    // Fetch usage data separately (expensive endpoint)
    async fetchUsageData() {
        try {
            const response = await fetch('/api/usage');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.data.usage = data;
            this.renderModule('usage', data);
        } catch (error) {
            console.error('Error fetching usage:', error);
            this.renderError('usage', error.message);
        }
    }

    // Render module content based on data type
    renderModule(key, data) {
        const moduleEl = document.getElementById(`module-${key}`);
        if (!moduleEl) return;

        moduleEl.classList.remove('loading');
        const contentEl = moduleEl.querySelector('.module-content');
        const badgeEl = moduleEl.querySelector('.module-badge');

        try {
            switch (key) {
                case 'health':
                    contentEl.innerHTML = this.renderHealth(data);
                    badgeEl.textContent = data.ok ? 'OK' : 'Error';
                    badgeEl.classList.toggle('active', !!data.ok);
                    badgeEl.style.color = data.ok ? '' : 'var(--accent-red)';
                    break;
                case 'status':
                    contentEl.innerHTML = this.renderStatus(data);
                    badgeEl.textContent = 'OK';
                    badgeEl.classList.add('active');
                    break;
                case 'system':
                    contentEl.innerHTML = this.renderSystem(data);
                    badgeEl.textContent = 'OK';
                    badgeEl.classList.add('active');
                    break;
                case 'knowledge':
                    contentEl.innerHTML = this.renderKnowledge(data);
                    badgeEl.textContent = 'OK';
                    badgeEl.classList.add('active');
                    break;
                case 'cron': {
                    const jobs = data.jobs || [];
                    const changes = this.computeCronChanges(jobs);
                    contentEl.innerHTML = this.renderCron(data, changes);

                    const jobCount = jobs.length;
                    if (changes.added.length || changes.removed.length) {
                        const changeBits = [];
                        if (changes.added.length) changeBits.push(`NEW ${changes.added.length}`);
                        if (changes.removed.length) changeBits.push(`REMOVED ${changes.removed.length}`);
                        badgeEl.textContent = changeBits.join(' • ');
                        badgeEl.classList.add('active');
                    } else {
                        badgeEl.textContent = jobCount > 0 ? `${jobCount} jobs` : 'None';
                        badgeEl.classList.toggle('active', jobCount > 0);
                    }
                    break;
                }
                case 'usage': {
                    contentEl.innerHTML = this.renderUsage(data);
                    const totalCost = data.totalCost || 0;
                    badgeEl.textContent = `$${totalCost.toFixed(2)}`;
                    badgeEl.classList.add('active');
                    break;
                }
            }
        } catch (error) {
            this.renderError(key, error.message);
        }
    }

    // Render Health Module
    renderHealth(data) {
        // Gateway health status at top
        const isHealthy = data.ok === true;
        // Get version from separate endpoint data
        const versionData = this.data.version || {};
        const version = versionData.version || 'Unknown';
        
        // Channels as subcategory
        const channels = data.channels || data.Channels || {};
        const channelHTML = Object.entries(channels).map(([name, ch]) => {
            const isActive = ch?.configured && ch?.probe?.ok;
            return `
            <div class="stat-item">
                <div class="stat-label">${name}</div>
                <div class="stat-value ${isActive ? 'green' : 'orange'}">
                    ${isActive ? 'Active' : 'Inactive'}
                </div>
            </div>
        `;
        }).join('');

        return `
            <div class="gateway-health">
                <div class="health-status ${isHealthy ? 'healthy' : 'error'}">
                    ${isHealthy ? 'Healthy' : 'Error'}
                </div>
                <div class="version-info">OpenClaw ${version}</div>
            </div>
            <div class="channel-subheading">Channels</div>
            <div class="stats-grid">
                ${channelHTML || '<div class="stat-item"><div class="stat-label">No channels</div></div>'}
            </div>
        `;
    }

    // Render Status Module (Agents & Sessions)
    renderStatus(data) {
        const sessions = data.sessions?.recent || [];
        const agents = data.sessions?.byAgent || [];

        // Agents section
        const agentsHTML = agents.map(agent => `
            <div class="agent-item">
                <div class="agent-info">
                    <div class="agent-avatar">${agent.agentId.charAt(0).toUpperCase()}</div>
                    <span class="agent-name">${agent.agentId}</span>
                </div>
                <div class="agent-status">
                    <span class="dot"></span>
                    ${agent.count} sessions
                </div>
            </div>
        `).join('');

        // Sessions section - shortened keys with click to expand (only if needed)
        const sessionsHTML = sessions.slice(0, CONFIG.ui.maxSessions).map(session => {
            const fullKey = session.key;
            const shortKey = this.shortenSessionKey(fullKey);
            const needsExpansion = shortKey !== fullKey;
            
            return `
            <div class="session-item${needsExpansion ? ' expandable' : ''}"${needsExpansion ? ` onclick="this.classList.toggle('expanded'); this.querySelector('.session-key').textContent = this.classList.contains('expanded') ? '${fullKey}' : '${shortKey}'"` : ''}>
                <div class="session-key">${shortKey}</div>
                <div class="session-meta">
                    <span>${session.model || 'N/A'}</span>
                    <span>${this.formatTokens(session.totalTokens)} tokens</span>
                    <span>${this.formatAge(session.age)}</span>
                </div>
            </div>
        `}).join('');

        return `
            <div style="margin-bottom: 16px;">
                <div class="stat-label" style="margin-bottom: 8px;">Active Agents</div>
                <div class="agent-list">${agentsHTML || '<div class="stat-item">No agents</div>'}</div>
            </div>
            <div>
                <div class="stat-label" style="margin-bottom: 8px;">Recent Sessions</div>
                ${sessionsHTML || '<div class="stat-item">No sessions</div>'}
            </div>
        `;
    }

    // Shorten session key by removing UUID/long ID suffix
    shortenSessionKey(key) {
        const parts = key.split(':');
        if (parts.length <= 2) return key;
        
        const lastPart = parts[parts.length - 1];
        // Check if last part looks like a UUID (36 chars with dashes) or long ID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastPart);
        const isLongID = /^[0-9a-f]{8,}$/i.test(lastPart) && lastPart.length > 12;
        
        if (isUUID || isLongID) {
            parts.pop();
        }
        return parts.join(':');
    }

    // Render System Module
    renderSystem(data) {
        // Parse fastfetch JSON output
        let cpu = 0, memUsed = 0, memTotal = 32, memPercent = 0, diskUsed = 0, diskTotal = 460, diskPercent = 0, uptime = 0;
        
        if (data.os) {
            // fastfetch JSON structure
            uptime = data.os?.Uptime || 0;
        }
        
        if (data.cpu) {
            cpu = typeof data.cpu.usage === 'number' ? data.cpu.usage : 0;
        }
        
        if (data.memory) {
            const mem = data.memory;
            memUsed = parseFloat(mem.used) || 0;
            memTotal = mem.total || 32;
            memPercent = mem.percent || Math.round((memUsed / memTotal) * 100);
        }
        
        if (data.disk && Array.isArray(data.disk)) {
            const rootDisk = data.disk.find(d => d.mount === '/') || data.disk[0];
            if (rootDisk) {
                diskUsed = rootDisk.used || 0;
                diskTotal = rootDisk.total || 460;
                diskPercent = rootDisk.percent || Math.round((diskUsed / diskTotal) * 100);
            }
        }

        // Format uptime
        const uptimeStr = this.formatUptime(uptime);

        return `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-label" style="text-align:center">CPU Usage</div>
                    <div class="stat-value" id="cpu-value" style="text-align:center">${cpu}%</div>
                    <div class="progress-bar"><div class="progress-fill" id="cpu-bar" style="width: ${cpu}%"></div></div>
                </div>
                <div class="stat-item">
                    <div class="stat-label" style="text-align:center">CPU Temp</div>
                    <div class="stat-value" id="cpu-temp-value" style="text-align:center;color:${this.getTempColor(data.cpu?.temperature)}">${data.cpu?.temperature || '--'}°C</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label" style="text-align:center">Memory</div>
                    <div class="stat-value" id="memory-value" style="text-align:center">${memUsed.toFixed(1)}/${memTotal} GB</div>
                    <div class="progress-bar"><div class="progress-fill" id="memory-bar" style="width: ${memPercent}%"></div></div>
                </div>
                <div class="stat-item">
                    <div class="stat-label" style="text-align:center">Disk</div>
                    <div class="stat-value" id="disk-value" style="text-align:center">${diskUsed}/${diskTotal} GB</div>
                    <div class="progress-bar"><div class="progress-fill" id="disk-bar" style="width: ${diskPercent}%"></div></div>
                </div>
                <div class="stat-item">
                    <div class="stat-label" style="text-align:center">Uptime</div>
                    <div class="stat-value" id="uptime-value" style="text-align:center">${uptimeStr}</div>
                </div>
            </div>
        `;
    }

    // Render Knowledge Base Module
    renderKnowledge(data) {
        const count = data.count || 0;
        return `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-label">Documents</div>
                    <div class="stat-value green">${count}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Status</div>
                    <div class="stat-value ${count > 0 ? 'green' : 'orange'}">
                        ${count > 0 ? 'Active' : 'Empty'}
                    </div>
                </div>
            </div>
        `;
    }

    computeCronChanges(currentJobs = []) {
        const previousJobs = this.cronPreviousJobs || [];
        const previousMap = new Map(previousJobs.map(job => [this.getCronJobKey(job), job]));
        const currentMap = new Map(currentJobs.map(job => [this.getCronJobKey(job), job]));

        const added = [];
        const removed = [];

        if (this.cronHasSnapshot) {
            for (const [key, job] of currentMap.entries()) {
                if (!previousMap.has(key)) added.push(job);
            }

            for (const [key, job] of previousMap.entries()) {
                if (!currentMap.has(key)) removed.push(job);
            }
        }

        return { added, removed };
    }

    getCronJobKey(job = {}) {
        return job.raw || `${job.schedule || ''}::${job.command || ''}`;
    }

    // Render Cron Module
    renderCron(data, changes = { added: [], removed: [] }) {
        const jobs = data.jobs || [];
        const addedKeys = new Set((changes.added || []).map(job => job.id));

        const formatNextRun = (ms) => {
            if (!ms) return 'N/A';
            const date = new Date(ms);
            return date.toLocaleString('en-CH', { 
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
            });
        };

        const jobsHTML = jobs.map(job => {
            const isNew = addedKeys.has(job.id);
            const scheduleDesc = this.formatCronSchedule(job.schedule);
            const nextRun = formatNextRun(job.nextRun);
            const statusClass = job.enabled ? 'active' : 'disabled';
            
            return `
                <div class="cron-item${isNew ? ' new' : ''}">
                    <div class="cron-header">
                        <span class="cron-name">${this.escapeHtml(job.name || 'Unnamed')}</span>
                        <span class="cron-status ${statusClass}">${job.enabled ? 'ACTIVE' : 'DISABLED'}</span>
                    </div>
                    <div class="cron-schedule">${scheduleDesc}</div>
                    <div class="cron-next">Next: ${nextRun}</div>
                    ${isNew ? '<span class="cron-badge new-badge">NEW</span>' : ''}
                </div>
            `;
        }).join('');

        this.cronPreviousJobs = jobs;
        this.cronHasSnapshot = true;

        if (!jobsHTML) {
            return `
                <div class="cron-empty">
                    <div class="stat-value orange">No cron jobs</div>
                </div>
            `;
        }

        return `<div class="cron-list">${jobsHTML}</div>`;
    }

    // Format cron schedule to human readable
    formatCronSchedule(schedule) {
        if (!schedule) return 'Unknown';

        // Macro shortcuts
        const macros = {
            '@reboot':   'At reboot',
            '@yearly':   'Yearly',
            '@annually': 'Yearly',
            '@monthly':  'Monthly',
            '@weekly':   'Weekly',
            '@daily':    'Daily at midnight',
            '@midnight': 'Daily at midnight',
            '@hourly':   'Every hour'
        };
        if (macros[schedule.trim().toLowerCase()]) {
            return macros[schedule.trim().toLowerCase()];
        }

        // Parse 5-field standard cron
        const parts = schedule.split(/\s+/);
        if (parts.length < 5) return schedule;

        const [min, hour, day, month, dow] = parts;

        if (min === '*' && hour === '*' && day === '*' && month === '*' && dow === '*') {
            return 'Every minute';
        }
        if (min === '0' && hour === '*' && day === '*' && month === '*' && dow === '*') {
            return 'Every hour';
        }
        if (min === '0' && hour === '0' && day === '*' && month === '*' && dow === '*') {
            return 'Daily at midnight';
        }
        if (/^\d+$/.test(min) && /^\d+$/.test(hour) && day === '*' && month === '*' && dow === '*') {
            return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
        }
        if (/^\*\/\d+$/.test(min) && hour === '*' && day === '*' && month === '*' && dow === '*') {
            return `Every ${min.slice(2)} min`;
        }

        // Fallback: raw schedule
        return schedule;
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Render Usage Module
    renderUsage(data) {
        const models = data.models || {};
        const totalCost = data.totalCost || 0;
        const totalTokens = data.totalTokens || 0;
        const sessionCount = data.sessionCount || 0;

        // Model display names
        const modelNames = {
            'MiniMax-M2.5': 'MiniMax M2.5',
            'claude-sonnet-4-6': 'Claude Sonnet 4.6',
            'openai-codex-5.3': 'OpenAI Codex 5.3'
        };

        // Model icons
        const modelIcons = {
            'MiniMax-M2.5': '🔵',
            'claude-sonnet-4-6': '🟣',
            'openai-codex-5.3': '🟢'
        };

        const modelRows = Object.entries(models).map(([model, stats]) => {
            const name = modelNames[model] || model;
            const icon = modelIcons[model] || '⚪';
            const totalModelTokens = stats.inputTokens + stats.outputTokens;
            const costDisplay = stats.cost === null ? 'N/A' : `$${stats.cost.toFixed(3)}`;
            return `
                <div class="usage-model-row">
                    <div class="usage-model-info">
                        <span class="usage-icon">${icon}</span>
                        <span class="usage-model-name">${name}</span>
                    </div>
                    <div class="usage-model-stats">
                        <div class="usage-tokens">${this.formatTokens(stats.inputTokens)} in + ${this.formatTokens(stats.outputTokens)} out</div>
                        <div class="usage-cost">${costDisplay}</div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="usage-summary">
                <div class="usage-total-cost">
                    <div class="usage-cost-label">Total Cost</div>
                    <div class="usage-cost-value">$${totalCost.toFixed(2)}</div>
                </div>
                <div class="usage-total-tokens">
                    <div class="usage-tokens-label">Total Tokens</div>
                    <div class="usage-tokens-value">${this.formatTokens(totalTokens)}</div>
                </div>
                <div class="usage-sessions">
                    <div class="usage-sessions-label">Sessions</div>
                    <div class="usage-sessions-value">${sessionCount}</div>
                </div>
            </div>
            <div class="usage-models">
                ${modelRows || '<div class="usage-empty">No usage data</div>'}
            </div>
            <div class="usage-timestamp">
                Updated: ${data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'N/A'}
            </div>
        `;
    }

    // Fetch local system information
    async fetchSystemInfo() {
        // This is called once; auto-refresh handles updates
    }

    // Render error state
    renderError(key, message) {
        const moduleEl = document.getElementById(`module-${key}`);
        if (!moduleEl) return;

        moduleEl.classList.remove('loading');
        moduleEl.classList.add('error');
        
        const contentEl = moduleEl.querySelector('.module-content');
        const badgeEl = moduleEl.querySelector('.module-badge');
        
        contentEl.innerHTML = `<div class="error-message">${message}</div>`;
        badgeEl.textContent = 'Error';
        badgeEl.style.color = 'var(--accent-red)';
    }

    // Auto-refresh - different intervals for different metrics
    startAutoRefresh() {
        // CPU + Temperature refresh every 5 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/api/system');
                if (response.ok) {
                    const data = await response.json();
                    this.data.system = data;
                    this.updateSystemMetric('cpu', data.cpu?.usage || 0);
                    this.updateSystemMetric('temperature', data.cpu?.temperature || null);
                }
            } catch (error) {
                console.error('Error refreshing CPU:', error);
            }
        }, 5000);

        // Memory refresh every 10 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/api/system');
                if (response.ok) {
                    const data = await response.json();
                    this.data.system = data;
                    this.updateSystemMetric('memory', data.memory);
                }
            } catch (error) {
                console.error('Error refreshing memory:', error);
            }
        }, 10000);

        // Disk refresh every 30 minutes
        setInterval(async () => {
            try {
                const response = await fetch('/api/system');
                if (response.ok) {
                    const data = await response.json();
                    this.data.system = data;
                    this.updateSystemMetric('disk', data.disk?.[0]);
                }
            } catch (error) {
                console.error('Error refreshing disk:', error);
            }
        }, 30 * 60 * 1000);

        // Uptime refresh every 1 hour
        setInterval(async () => {
            try {
                const response = await fetch('/api/system');
                if (response.ok) {
                    const data = await response.json();
                    this.data.system = data;
                    this.updateSystemMetric('uptime', data.os?.Uptime || 0);
                }
            } catch (error) {
                console.error('Error refreshing uptime:', error);
            }
        }, 60 * 60 * 1000);

        // Full dashboard refresh every 30s (excludes usage)
        setInterval(async () => {
            await this.fetchAllData();
        }, CONFIG.gateway.refreshInterval);

        // Usage refresh every 30 minutes (expensive API call)
        setInterval(async () => {
            await this.fetchUsageData();
        }, CONFIG.gateway.usageRefreshInterval);
    }

    // Update individual system metric without full re-render
    updateSystemMetric(metric, value) {
        if (metric === 'cpu' && value) {
            const cpuVal = document.getElementById('cpu-value');
            const cpuBar = document.getElementById('cpu-bar');
            if (cpuVal) {
                cpuVal.textContent = `${value}%`;
                cpuVal.className = `stat-value ${value > 80 ? 'red' : value > 60 ? 'orange' : 'green'}`;
            }
            if (cpuBar) {
                cpuBar.style.width = `${Math.min(100, value)}%`;
                cpuBar.className = `progress-fill ${value > 80 ? 'danger' : value > 60 ? 'warning' : ''}`;
            }
        } else if (metric === 'temperature' && value) {
            const tempEl = document.getElementById('cpu-temp-value');
            if (tempEl) {
                tempEl.textContent = `${value}°C`;
                // Color based on temperature
                if (value > 80) {
                    tempEl.style.color = 'var(--accent-red)';
                } else if (value > 60) {
                    tempEl.style.color = 'var(--accent-orange)';
                } else {
                    tempEl.style.color = 'var(--accent-green)';
                }
            }
        } else if (metric === 'memory' && value) {
            const memVal = document.getElementById('memory-value');
            const memBar = document.getElementById('memory-bar');
            if (memVal) {
                const memUsed = parseFloat(value.used) || 0;
                memVal.textContent = `${memUsed.toFixed(1)}/${value.total} GB`;
                memVal.className = `stat-value ${value.percent > 80 ? 'red' : value.percent > 60 ? 'orange' : 'green'}`;
            }
            if (memBar) {
                memBar.style.width = `${value.percent}%`;
                memBar.className = `progress-fill ${value.percent > 80 ? 'danger' : value.percent > 60 ? 'warning' : ''}`;
            }
        } else if (metric === 'disk' && value) {
            const diskVal = document.getElementById('disk-value');
            const diskBar = document.getElementById('disk-bar');
            if (diskVal) {
                diskVal.textContent = `${value.used}/${value.total} GB`;
                diskVal.className = `stat-value ${value.percent > 90 ? 'red' : value.percent > 75 ? 'orange' : 'green'}`;
            }
            if (diskBar) {
                diskBar.style.width = `${value.percent}%`;
                diskBar.className = `progress-fill ${value.percent > 90 ? 'danger' : value.percent > 75 ? 'warning' : ''}`;
            }
        } else if (metric === 'uptime' && value) {
            const uptimeVal = document.getElementById('uptime-value');
            if (uptimeVal) {
                uptimeVal.textContent = this.formatUptime(value);
            }
        }
    }

    // Update timestamp
    updateTimestamp() {
        const el = document.getElementById('last-updated');
        if (el) {
            el.textContent = new Date().toLocaleTimeString();
        }
    }

    // Utility: Get temperature color
    getTempColor(temp) {
        if (!temp) return 'var(--text-secondary)';
        if (temp > 80) return 'var(--accent-red)';
        if (temp > 60) return 'var(--accent-orange)';
        return 'var(--accent-green)';
    }

    // Utility: Format tokens
    formatTokens(tokens) {
        if (!tokens) return '0';
        if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}k`;
        return tokens;
    }

    // Utility: Format age
    formatAge(ms) {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }

    // Utility: Format uptime
    formatUptime(seconds) {
        if (!seconds) return '--';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.nexus = new NexusDashboard();
});
