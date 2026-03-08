// Nexus Dashboard - Main Workspace Application

class NexusDashboard {
    constructor() {
        this.data = {};
        this.modules = {};
        this.apiBase = ''; // Will be set automatically
        this.cronPreviousJobs = [];
        this.cronHasSnapshot = false;
        this.agentNames = { 'main': 'mika' };
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
        
        // Header refresh button
        const headerRefreshBtn = document.getElementById('header-refresh');
        if (headerRefreshBtn) {
            headerRefreshBtn.addEventListener('click', async () => {
                headerRefreshBtn.style.opacity = '0.5';
                await this.fetchAllData();
                await this.fetchUsageData();
                this.updateTimestamp();
                headerRefreshBtn.style.opacity = '1';
            });
        }
        
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
            
            // Add refresh button for merged modules
            const refreshBtn = (key === 'gatewaySystem' || key === 'apiAgents') 
                ? `<button class="module-refresh" data-module="${key}" title="Refresh">⟳</button>` 
                : '';
            
            moduleEl.innerHTML = `
                <div class="module-header">
                    <div class="module-title-area">
                        <div class="module-title">
                            <span class="icon">${mod.icon}</span>
                            <span>${mod.title}</span>
                        </div>
                        ${refreshBtn}
                    </div>
                    <span class="module-badge">Loading</span>
                </div>
                <div class="module-content">
                    <div class="spinner"></div>
                </div>
            `;
            dashboard.appendChild(moduleEl);
        });
        
        // Add click handlers for refresh buttons
        document.querySelectorAll('.module-refresh').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const moduleKey = btn.dataset.module;
                this.refreshModule(moduleKey);
            });
        });
    }

    // Fetch all data from APIs
    async fetchAllData() {
        const endpoints = [
            { key: 'health', url: '/api/gateway/health' },
            { key: 'version', url: '/api/version' },
            { key: 'dashboardVersion', url: '/api/dashboard-version' },
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
                
                // Render merged modules when their sub-data is ready
                if (key === 'health' || key === 'system') {
                    this.renderModule('gatewaySystem', data);
                } else if (key === 'status' || key === 'usage') {
                    this.renderModule('apiAgents', data);
                } else {
                    this.renderModule(key, data);
                }
                
                // Update footer version
                if (key === 'dashboardVersion' && data.version) {
                    const footerVersion = document.getElementById('footer-version');
                    if (footerVersion) footerVersion.textContent = data.version;
                }
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
                case 'gatewaySystem': {
                    // Render both Gateway health and System Overview
                    const healthData = this.data.health || {};
                    const systemData = this.data.system || {};
                    
                    // Gateway health section
                    const isHealthy = healthData.ok === true;
                    const versionData = this.data.version || {};
                    const version = versionData.version || 'Unknown';
                    
                    const channels = healthData.channels || healthData.Channels || {};
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

                    // System stats
                    let cpu = 0, memUsed = 0, memTotal = 32, memPercent = 0, diskUsed = 0, diskTotal = 460, diskPercent = 0, uptime = 0;
                    if (systemData.os) uptime = systemData.os?.Uptime || 0;
                    if (systemData.cpu) cpu = typeof systemData.cpu.usage === 'number' ? systemData.cpu.usage : 0;
                    if (systemData.memory) {
                        const mem = systemData.memory;
                        memUsed = parseFloat(mem.used) || 0;
                        memTotal = mem.total || 32;
                        memPercent = mem.percent || Math.round((memUsed / memTotal) * 100);
                    }
                    if (systemData.disk && Array.isArray(systemData.disk)) {
                        const rootDisk = systemData.disk.find(d => d.mount === '/') || systemData.disk[0];
                        if (rootDisk) {
                            diskUsed = rootDisk.used || 0;
                            diskTotal = rootDisk.total || 460;
                            diskPercent = rootDisk.percent || Math.round((diskUsed / diskTotal) * 100);
                        }
                    }
                    const uptimeStr = this.formatUptime(uptime);
                    const cpuTemp = this.getCpuTemperature(systemData);

                    contentEl.innerHTML = `
                        <div class="merged-section">
                            <div class="section-header">
                                <span class="section-icon">🌐</span>
                                <span class="section-title">Gateway</span>
                            </div>
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
                        </div>
                        <div class="merged-section">
                            <div class="section-header">
                                <span class="section-icon">⚡</span>
                                <span class="section-title">System Overview</span>
                            </div>
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <div class="stat-label" style="text-align:center">CPU Usage</div>
                                    <div class="stat-value" id="cpu-value" style="text-align:center">${cpu}%</div>
                                    <div class="progress-bar"><div class="progress-fill" id="cpu-bar" style="width: ${cpu}%"></div></div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-label" style="text-align:center">CPU Temp</div>
                                    <div class="stat-value" id="cpu-temp-value" style="text-align:center;color:${this.getTempColor(cpuTemp)}">${this.formatTemperature(cpuTemp)}</div>
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
                        </div>
                    `;
                    
                    // Update badge based on both health and system status
                    const allOk = isHealthy;
                    badgeEl.textContent = allOk ? 'OK' : 'Error';
                    badgeEl.classList.toggle('active', !!allOk);
                    badgeEl.style.color = allOk ? '' : 'var(--accent-red)';
                    break;
                }
                
                case 'apiAgents': {
                    // Render both API Usage and Agents & Sessions
                    const usageData = this.data.usage || {};
                    const statusData = this.data.status || {};
                    
                    // Usage section
                    const models = usageData.models || {};
                    const totalCost = usageData.totalCost || 0;
                    const totalTokens = usageData.totalTokens || 0;
                    const sessionCount = usageData.sessionCount || 0;
                    
                    const modelNames = {
                        'MiniMax-M2.5': 'MiniMax M2.5',
                        'claude-sonnet-4-6': 'Claude Sonnet 4.6',
                        'gpt-5.3-codex': 'GPT Codex 5.3'
                    };
                    
                    const modelIcons = {
                        'MiniMax-M2.5': '🔵',
                        'claude-sonnet-4-6': '🟣',
                        'gpt-5.3-codex': '🟢'
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
                    
                    const usageHTML = `
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
                    `;
                    
                    // Agents section (from status data)
                    const agents = statusData.sessions?.byAgent || [];
                    const agentsHTML = agents.map((agent) => {
                        // Determine if agent is active (most recent session < 60 seconds ago)
                        const mostRecentAge = agent.recent?.[0]?.age || Infinity;
                        const isActive = mostRecentAge < 60000;
                        const statusClass = isActive ? 'active' : 'idle';
                        
                        const sessionsList = (agent.recent || []).map(session => {
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
                        `;
                        }).join('');
                        
                        return `
                        <div class="agent-accordion">
                            <div class="agent-accordion-header" onclick="this.classList.toggle('expanded'); this.nextElementSibling.classList.toggle('expanded');">
                                <div class="agent-info">
                                    <span class="accordion-arrow">▶</span>
                                    <div class="agent-avatar">${(this.agentNames[agent.agentId] || agent.agentId).charAt(0).toUpperCase()}</div>
                                    <span class="agent-name">${this.agentNames[agent.agentId] || agent.agentId}</span>
                                </div>
                                <div class="agent-status ${statusClass}">
                                    <span class="dot"></span>
                                    ${isActive ? 'Active' : 'Idle'}
                                </div>
                            </div>
                            <div class="agent-accordion-content">
                                <div class="sessions-list">
                                    ${sessionsList || '<div class="session-empty">No sessions</div>'}
                                </div>
                            </div>
                        </div>
                    `;
                    }).join('');
                    
                    contentEl.innerHTML = `
                        <div class="merged-section">
                            <div class="section-header">
                                <span class="section-icon">💰</span>
                                <span class="section-title">API Usage</span>
                            </div>
                            ${usageHTML}
                        </div>
                        <div class="merged-section">
                            <div class="section-header">
                                <span class="section-icon">🤖</span>
                                <span class="section-title">Agents & Sessions</span>
                            </div>
                            <div class="agents-accordion-container">
                                ${agentsHTML || '<div class="stat-item">No agents</div>'}
                            </div>
                        </div>
                    `;
                    
                    badgeEl.textContent = `$${totalCost.toFixed(2)}`;
                    badgeEl.classList.add('active');
                    break;
                }
                
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
                
                case 'knowledge':
                    contentEl.innerHTML = this.renderKnowledge(data);
                    badgeEl.textContent = 'OK';
                    badgeEl.classList.add('active');
                    break;
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

    // Render Status Module (Agents & Sessions) - Collapsible Accordion
    renderStatus(data) {
        const agents = data.sessions?.byAgent || [];

        // Build accordion HTML - each agent is a collapsible section
        const agentsHTML = agents.map((agent, index) => {
            // Build sessions list for this agent
            const sessionsList = (agent.recent || []).map(session => {
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
            `;
            }).join('');

            return `
            <div class="agent-accordion">
                <div class="agent-accordion-header" onclick="this.classList.toggle('expanded'); this.nextElementSibling.classList.toggle('expanded');">
                    <div class="agent-info">
                        <span class="accordion-arrow">▶</span>
                        <div class="agent-avatar">${(this.agentNames[agent.agentId] || agent.agentId).charAt(0).toUpperCase()}</div>
                        <span class="agent-name">${this.agentNames[agent.agentId] || agent.agentId}</span>
                    </div>
                    <div class="agent-status">
                        <span class="dot"></span>
                        ${agent.count} session${agent.count !== 1 ? 's' : ''}
                    </div>
                </div>
                <div class="agent-accordion-content">
                    <div class="sessions-list">
                        ${sessionsList || '<div class="session-empty">No sessions</div>'}
                    </div>
                </div>
            </div>
        `;
        }).join('');

        return `
            <div class="agents-accordion-container">
                ${agentsHTML || '<div class="stat-item">No agents</div>'}
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
                    <div class="stat-value" id="cpu-temp-value" style="text-align:center;color:${this.getTempColor(this.getCpuTemperature(data))}">${this.formatTemperature(this.getCpuTemperature(data))}</div>
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
        const total = data.total || 0;
        const categories = data.categories || {};
        const catNames = {
            business: 'Business',
            finance: 'Finance',
            personal: 'Personal',
            references: 'References'
        };
        
        const catRows = Object.entries(categories).map(([key, count]) => `
            <div class="kb-category">
                <span class="kb-cat-name">${catNames[key] || key}</span>
                <span class="kb-cat-count">${count}</span>
            </div>
        `).join('');
        
        return `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-label">Total Documents</div>
                    <div class="stat-value green">${total}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Status</div>
                    <div class="stat-value ${total > 0 ? 'green' : 'orange'}">
                        ${total > 0 ? 'Active' : 'Empty'}
                    </div>
                </div>
            </div>
            <div class="kb-categories">
                ${catRows}
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
            const statusLed = job.enabled 
                ? '<span class="cron-led active"></span>' 
                : '<span class="cron-led inactive"></span>';
            const message = job.message || '';
            const hasMessage = message.trim().length > 0;
            
            return `
                <div class="cron-item${isNew ? ' new' : ''}${hasMessage ? ' expandable' : ''}"${hasMessage ? ` onclick="this.classList.toggle('expanded')"` : ''}>
                    <div class="cron-header">
                        <span class="cron-name">${this.escapeHtml(job.name || 'Unnamed')}</span>
                        ${statusLed}
                    </div>
                    <div class="cron-schedule">${scheduleDesc}</div>
                    <div class="cron-next">Next: ${nextRun}</div>
                    ${hasMessage ? `<div class="cron-message">${this.escapeHtml(message)}</div>` : ''}
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

        // Handle object format (e.g., { kind: "every", everyMs: 259200000 })
        if (typeof schedule === 'object') {
            if (schedule.kind === 'every' && schedule.everyMs) {
                const ms = schedule.everyMs;
                const minutes = Math.floor(ms / 60000);
                const hours = Math.floor(ms / 3600000);
                const days = Math.floor(ms / 86400000);
                
                if (days >= 1) return `Every ${days} day${days > 1 ? 's' : ''}`;
                if (hours >= 1) return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
                if (minutes >= 1) return `Every ${minutes} min`;
                return `Every ${ms}ms`;
            }
            return 'Unknown';
        }

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

        // Common patterns
        if (min === '*' && hour === '*' && day === '*' && month === '*' && dow === '*') {
            return 'Every minute';
        }
        if (min === '0' && hour === '*' && day === '*' && month === '*' && dow === '*') {
            return 'Every hour';
        }
        if (min === '0' && hour === '0' && day === '*' && month === '*' && dow === '*') {
            return 'Daily at midnight';
        }
        
        // Specific daily times: "0 3 * * *" → "Daily at 03:00"
        if (/^\d+$/.test(min) && /^\d+$/.test(hour) && day === '*' && month === '*' && dow === '*') {
            return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
        }
        
        // Every N hours: "0 */3 * * *" → "Every 3 hours"
        if (min === '0' && /^\*\/\d+$/.test(hour) && day === '*' && month === '*' && dow === '*') {
            const hrs = hour.slice(2);
            return `Every ${hrs} hours`;
        }
        
        // Every N days at specific time: "0 10 */3 * *" → "Every 3 days"
        if (min === '0' && /^\d+$/.test(hour) && /^\*\/\d+$/.test(day) && month === '*' && dow === '*') {
            const days = day.slice(2);
            return `Every ${days} days at ${hour.padStart(2, '0')}:00`;
        }
        
        // Every N minutes: "*/5 * * * *" → "Every 5 min"
        if (/^\*\/\d+$/.test(min) && hour === '*' && day === '*' && month === '*' && dow === '*') {
            const mins = min.slice(2);
            return `Every ${mins} min`;
        }
        
        // Weekly: "0 23 * * 0" → "Weekly on Sunday at 23:00"
        if (/^\d+$/.test(min) && /^\d+$/.test(hour) && day === '*' && month === '*' && /^\d+$/.test(dow)) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayName = days[parseInt(dow)] || `Day ${dow}`;
            return `Weekly on ${dayName} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
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
            'gpt-5.3-codex': 'GPT Codex 5.3'
        };

        // Model icons
        const modelIcons = {
            'MiniMax-M2.5': '🔵',
            'claude-sonnet-4-6': '🟣',
            'gpt-5.3-codex': '🟢'
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

    // Refresh a single module (for manual refresh button)
    async refreshModule(moduleKey) {
        const moduleEl = document.getElementById(`module-${moduleKey}`);
        if (!moduleEl) return;
        
        const btn = moduleEl.querySelector('.module-refresh');
        if (btn) btn.disabled = true;
        
        try {
            if (moduleKey === 'gatewaySystem') {
                // Refresh both gateway health and system data
                const [healthRes, systemRes] = await Promise.all([
                    fetch('/api/gateway/health'),
                    fetch('/api/system')
                ]);
                
                if (healthRes.ok) this.data.health = await healthRes.json();
                if (systemRes.ok) this.data.system = await systemRes.json();
                
                // Re-render the module
                this.renderModule('gatewaySystem', {});
            } else if (moduleKey === 'apiAgents') {
                // Refresh both usage and status data
                const [usageRes, statusRes] = await Promise.all([
                    fetch('/api/usage'),
                    fetch('/api/gateway/status')
                ]);
                
                if (usageRes.ok) this.data.usage = await usageRes.json();
                if (statusRes.ok) this.data.status = await statusRes.json();
                
                // Re-render the module
                this.renderModule('apiAgents', {});
            }
        } catch (error) {
            console.error(`Error refreshing ${moduleKey}:`, error);
        } finally {
            if (btn) btn.disabled = false;
        }
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
                    this.updateSystemMetric('temperature', this.getCpuTemperature(data));
                    
                    // Also re-render gatewaySystem module when system data changes
                    this.renderModule('gatewaySystem', {});
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
            // Re-render apiAgents when usage data is refreshed
            this.renderModule('apiAgents', {});
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
        } else if (metric === 'temperature') {
            const tempEl = document.getElementById('cpu-temp-value');
            if (tempEl) {
                tempEl.textContent = this.formatTemperature(value);
                tempEl.style.color = this.getTempColor(value);
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

    // Utility: Get CPU temperature from different payload shapes
    getCpuTemperature(data = {}) {
        const candidates = [
            data?.cpu?.temperature,
            data?.cpu?.temp,
            data?.temperature?.cpu,
            data?.temp?.cpu,
            data?.system?.cpu?.temperature
        ];

        for (const value of candidates) {
            if (value === null || value === undefined || value === '') continue;
            const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
            if (!Number.isNaN(parsed)) return Math.round(parsed);
        }

        return null;
    }

    // Utility: Temperature display formatter
    formatTemperature(temp) {
        if (temp === null || temp === undefined || Number.isNaN(Number(temp))) return '--';
        return `${Math.round(Number(temp))}°C`;
    }

    // Utility: Get temperature color
    getTempColor(temp) {
        if (temp === null || temp === undefined || Number.isNaN(Number(temp))) return 'var(--text-secondary)';
        const t = Number(temp);
        if (t > 80) return 'var(--accent-red)';
        if (t > 60) return 'var(--accent-orange)';
        return 'var(--accent-green)';
    }

    // Utility: Format tokens
    formatTokens(tokens) {
        if (!tokens) return '0';
        if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
        if (tokens >= 1000) return `${(tokens / 1000).toFixed(2)}k`;
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

// Initialize when DOM is ready (supports dynamic script injection)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.nexus = new NexusDashboard();
    });
} else {
    window.nexus = new NexusDashboard();
}
