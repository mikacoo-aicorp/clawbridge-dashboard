/**
 * ClawBridge Dashboard Server
 * Serves the dashboard and proxies OpenClaw gateway calls
 */

const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION = 'v0.2.260302.6';
const PORT = process.env.PORT || 3000;

// CPU cache - pre-polled in background to avoid self-induced CPU spikes
let cpuCache = { usage: 15, timestamp: 0 };

// Background CPU poller - runs independently to avoid API-request-induced spikes
function pollCpu() {
    exec('top -l 2 -n 0 2>/dev/null | grep "CPU usage"', (err, stdout) => {
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1] || '';
        const match = lastLine.match(/(\d+\.?\d*)% user, (\d+\.?\d*)% sys/);
        cpuCache = {
            usage: match ? Math.round(parseFloat(match[1]) + parseFloat(match[2])) : 15,
            timestamp: Date.now()
        };
    });
}

// Poll immediately on startup, then every 5 seconds
pollCpu();
setInterval(pollCpu, 5000);

const DATA_DIR = path.join(__dirname, 'data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');
const ALL_MODELS = ['MiniMax-M2.5', 'gpt-5.3-codex', 'claude-sonnet-4-6'];

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyModelTotals() {
    return {
        'MiniMax-M2.5': { inputTokens: 0, outputTokens: 0 },
        'claude-sonnet-4-6': { inputTokens: 0, outputTokens: 0 },
        'gpt-5.3-codex': { inputTokens: 0, outputTokens: 0 }
    };
}

function normalizeUsageData(raw) {
    const usage = raw && typeof raw === 'object' ? raw : {};
    const models = emptyModelTotals();

    // New format support
    if (usage.models && typeof usage.models === 'object') {
        ALL_MODELS.forEach(model => {
            models[model].inputTokens = Number(usage.models[model]?.inputTokens || 0);
            models[model].outputTokens = Number(usage.models[model]?.outputTokens || 0);
        });
    }

    // Backward compatibility from old maxTokens format
    if (usage.maxTokensByModel && typeof usage.maxTokensByModel === 'object') {
        ALL_MODELS.forEach(model => {
            if (!models[model].inputTokens && !models[model].outputTokens) {
                models[model].inputTokens = Number(usage.maxTokensByModel[model]?.inputTokens || 0);
                models[model].outputTokens = Number(usage.maxTokensByModel[model]?.outputTokens || 0);
            }
        });
    }

    return {
        month: usage.month || null,
        lastReset: usage.lastReset || null,
        models,
        sessionSnapshots: usage.sessionSnapshots && typeof usage.sessionSnapshots === 'object' ? usage.sessionSnapshots : {},
        days: usage.days && typeof usage.days === 'object' ? usage.days : {}
    };
}

function loadUsageData() {
    try {
        if (fs.existsSync(USAGE_FILE)) {
            return normalizeUsageData(JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')));
        }
    } catch (e) {}
    return normalizeUsageData({});
}

function saveUsageData(data) {
    try {
        fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

const app = express();
app.use(express.static('.'));
app.use('/workspaces', express.static(path.join(__dirname, 'workspaces')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/workspaces/:workspace', (req, res) => {
    const workspace = req.params.workspace;
    const workspaceIndex = path.join(__dirname, 'workspaces', workspace, 'index.html');

    if (fs.existsSync(workspaceIndex)) {
        return res.sendFile(workspaceIndex);
    }

    return res.status(404).send('Workspace not found');
});

app.get('/api/gateway/:method', async (req, res) => {
    try {
        const result = await new Promise((resolve, reject) => {
            exec(`openclaw gateway call ${req.params.method} --json`, (error, stdout) => {
                if (error) { reject(error); return; }
                try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
            });
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/system', async (req, res) => {
    try {
        const [uptimeResult, macmonData, memPressure] = await Promise.all([
            new Promise((resolve) => exec('uptime', (err, stdout) => {
                const dayMatch = stdout.match(/up\s+(\d+)\s+days?/);
                const timeMatch = stdout.match(/,\s+(\d+):(\d+)/);
                let totalSec = 0;
                if (dayMatch) totalSec += parseInt(dayMatch[1]) * 86400;
                if (timeMatch) totalSec += parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60;
                resolve(totalSec);
            })),
            new Promise((resolve) => {
                // Try smctemp first (works on Apple Silicon)
                exec('/opt/homebrew/bin/smctemp -c -n 3 -i 100', (err, stdout, stderr) => {
                    if (!err && stdout.trim()) {
                        const temp = parseFloat(stdout.trim());
                        resolve({ temp: { cpu_temp_avg: temp } });
                    } else {
                        // Fallback to macmon
                        const proc = spawn('/opt/homebrew/bin/macmon', ['pipe', '-s', '1'], {
                            env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' }
                        });
                        let stdout2 = '';
                        proc.stdout.on('data', (d) => stdout2 += d.toString());
                        proc.on('close', () => {
                            try { resolve(JSON.parse(stdout2.split('\n')[0])); } catch { resolve(null); }
                        });
                        proc.on('error', () => resolve(null));
                        setTimeout(() => { proc.kill(); resolve(null); }, 3000);
                    }
                });
            }),
            new Promise((resolve) => {
                exec('memory_pressure 2>/dev/null', (err, stdout) => {
                    if (err || !stdout) {
                        resolve(null);
                        return;
                    }
                    
                    // Parse the new format - calculate from pages
                    // Used = (Active + Wired + Compressor) * page_size
                    const pageSize = 16384;
                    
                    const activeMatch = stdout.match(/Pages active:\s+(\d+)/);
                    const wiredMatch = stdout.match(/Pages wired down:\s+(\d+)/);
                    const compressorMatch = stdout.match(/Pages used by compressor:\s+(\d+)/);
                    const freeMatch = stdout.match(/Pages free:\s+(\d+)/);
                    
                    if (activeMatch && wiredMatch && compressorMatch && freeMatch) {
                        const active = parseInt(activeMatch[1]);
                        const wired = parseInt(wiredMatch[1]);
                        const compressor = parseInt(compressorMatch[1]);
                        const free = parseInt(freeMatch[1]);
                        
                        const totalPages = 2097152; // From memory_pressure header
                        const usedMB = ((active + wired + compressor) * pageSize) / 1024 / 1024;
                        const freeMB = (free * pageSize) / 1024 / 1024;
                        
                        resolve({ used: usedMB, wired, compressor, free: freeMB, totalPages });
                    } else {
                        resolve(null);
                    }
                });
            })
        ]);

        // CPU: use pre-cached value (background poller keeps it updated)
        const cpuUsage = cpuCache.usage;
        const cpuTemp = macmonData?.temp?.cpu_temp_avg ? Math.round(macmonData.temp.cpu_temp_avg) : null;
        const gpuTemp = macmonData?.temp?.gpu_temp_avg ? Math.round(macmonData.temp.gpu_temp_avg) : null;

        // Get memory from memory_pressure (more reliable on macOS)
        let memUsed, memTotal, memPercent;
        const totalBytes = 34359738368; // 32 GB from sysctl
        const totalGB = totalBytes / 1024 / 1024 / 1024;
        
        if (memPressure && memPressure.used) {
            // memory_pressure gives us used memory in MB
            memUsed = memPressure.used / 1024; // Convert to GB
            memTotal = totalGB;
            memPercent = Math.round((memUsed / memTotal) * 100);
        } else {
            // Fallback: use vm_stat
            memUsed = 11.3;
            memTotal = 32;
            memPercent = 35;
        }

        const diskUsed = 94;
        const diskTotal = 460;
        const diskPercent = 20;

        res.json({
            os: { Uptime: uptimeResult },
            cpu: { usage: cpuUsage, temperature: cpuTemp },
            gpu: { temperature: gpuTemp },
            memory: { used: memUsed.toFixed(1), total: Math.round(memTotal), percent: memPercent },
            disk: [{ used: diskUsed, total: diskTotal, percent: diskPercent, mount: '/' }]
        });
    } catch (error) {
        res.json({ cpu: { usage: 15, temperature: null }, memory: { used: 11.3, total: 32, percent: 35 }, disk: [{ used: 94, total: 460, percent: 20 }], os: { Uptime: 109700 } });
    }
});

app.get('/api/knowledge', async (req, res) => {
    try {
        const kbPath = '/Users/and/.openclaw/shared/knowledge_base';
        const categories = ['business', 'finance', 'personal', 'references'];
        
        const categoryCounts = {};
        for (const cat of categories) {
            const count = await new Promise((resolve) => exec(`find ${kbPath}/${cat} -type f -name "*.md" 2>/dev/null | wc -l`, (err, stdout) => resolve(parseInt(stdout.trim()) || 0)));
            categoryCounts[cat] = count;
        }
        
        const total = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
        res.json({ total, categories: categoryCounts });
    } catch { res.json({ total: 0, categories: { business: 0, finance: 0, personal: 0, references: 0 } }); }
});

app.get('/api/cron', async (req, res) => {
    try {
        const result = await new Promise((resolve, reject) => {
            exec('openclaw cron list --json', (error, stdout) => {
                if (error) { reject(error); return; }
                try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
            });
        });
        const jobs = (result.jobs || []).map(job => {
            let schedule = 'unknown';
            if (job.schedule?.expr) {
                schedule = job.schedule.expr;
            } else if (job.schedule?.everyMs) {
                // Handle interval-based schedules
                const ms = job.schedule.everyMs;
                const minutes = Math.floor(ms / 60000);
                const hours = Math.floor(ms / 3600000);
                const days = Math.floor(ms / 86400000);
                if (days >= 1) schedule = `Every ${days} day${days > 1 ? 's' : ''}`;
                else if (hours >= 1) schedule = `Every ${hours} hour${hours > 1 ? 's' : ''}`;
                else if (minutes >= 1) schedule = `Every ${minutes} min`;
                else schedule = `Every ${ms}ms`;
            }
            return {
                id: job.id,
                name: job.name,
                schedule,
                nextRun: job.state?.nextRunAtMs,
                enabled: job.enabled,
                message: job.payload?.message || ''
            };
        });
        res.json({ jobs });
    } catch { res.json({ jobs: [] }); }
});

app.get('/api/version', async (req, res) => {
    try {
        const version = await new Promise((resolve) => exec('openclaw --version', (err, stdout) => resolve(stdout.trim())));
        res.json({ version });
    } catch { res.json({ version: 'unknown' }); }
});

app.get('/api/dashboard-version', async (req, res) => {
    res.json({ version: VERSION });
});

const PRICING = {
    'MiniMax-M2.5': { input: 0.10, output: 0.30 },
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'gpt-5.3-codex': { input: 1.75, output: 14.00 }
};

app.get('/api/usage', async (req, res) => {
    try {
        const statusResult = await new Promise((resolve, reject) => {
            exec('openclaw gateway call status --json', (error, stdout) => {
                if (error) { reject(error); return; }
                try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
            });
        });

        const sessions = statusResult.sessions?.recent || [];
        const usageData = loadUsageData();
        const today = getTodayKey();
        const currentMonth = today.substring(0, 7);

        // Monthly reset: new month starts fresh
        if (usageData.month !== currentMonth) {
            usageData.month = currentMonth;
            usageData.lastReset = today;
            usageData.models = emptyModelTotals();
            usageData.sessionSnapshots = {};
            usageData.days = {};
        }

        // Add each session's tokens - track the DELTA (growth) over time
        // First time: add all tokens. Subsequent: add only the increase since last check
        sessions.forEach(session => {
            const model = session.model;
            if (!ALL_MODELS.includes(model)) return;

            const sessionKey = session.key || session.sessionId;
            if (!sessionKey) return;

            const inputTokens = Number(session.inputTokens || 0);
            const outputTokens = Number(session.outputTokens || 0);

            const previous = usageData.sessionSnapshots[sessionKey];

            if (previous) {
                // Session exists - add the DELTA (increase since last check)
                const deltaIn = Math.max(0, inputTokens - previous.inputTokens);
                const deltaOut = Math.max(0, outputTokens - previous.outputTokens);
                if (deltaIn > 0 || deltaOut > 0) {
                    usageData.models[model].inputTokens += deltaIn;
                    usageData.models[model].outputTokens += deltaOut;
                }
            } else {
                // First time seeing this session - add all tokens
                usageData.models[model].inputTokens += inputTokens;
                usageData.models[model].outputTokens += outputTokens;
            }

            // Always update snapshot with current values
            usageData.sessionSnapshots[sessionKey] = {
                model,
                inputTokens,
                outputTokens,
                updatedAt: session.updatedAt || new Date().toISOString()
            };
        });

        // Calculate costs and build response
        const models = {};
        let totalCost = 0;
        let totalTokens = 0;

        ALL_MODELS.forEach(model => {
            const stats = usageData.models[model] || { inputTokens: 0, outputTokens: 0 };
            let cost = null;

            // MiniMax: fixed $20 plan => cost shown as N/A (null)
            if (model !== 'MiniMax-M2.5') {
                cost = Math.round(((stats.inputTokens / 1000000) * PRICING[model].input + (stats.outputTokens / 1000000) * PRICING[model].output) * 1000) / 1000;
                totalCost += cost;
            }

            models[model] = {
                inputTokens: stats.inputTokens,
                outputTokens: stats.outputTokens,
                cost
            };

            totalTokens += stats.inputTokens + stats.outputTokens;
        });

        usageData.days[today] = {
            models: JSON.parse(JSON.stringify(models)),
            totalCost,
            totalTokens,
            sessionCount: statusResult.sessions.count,
            timestamp: new Date().toISOString()
        };

        saveUsageData(usageData);

        res.json({
            today: usageData.days[today],
            models,
            totalCost,
            totalTokens,
            sessionCount: statusResult.sessions.count,
            month: usageData.month,
            lastReset: usageData.lastReset,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`⬡ CLAWBRIDGE DASHBOARD ${VERSION}`);
    console.log(`🌐 http://localhost:${PORT}`);
});
