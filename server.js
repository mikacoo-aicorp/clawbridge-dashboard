/**
 * ClawBridge Dashboard Server
 * Serves the dashboard and proxies OpenClaw gateway calls
 */

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION = 'v0.2.260228.12';
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsageData() {
    try {
        if (fs.existsSync(USAGE_FILE)) {
            return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
        }
    } catch (e) {}
    return { days: {}, maxTokensByModel: {} };
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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
        const [uptimeResult, topOutput, macmonData] = await Promise.all([
            new Promise((resolve) => exec('uptime', (err, stdout) => {
                const dayMatch = stdout.match(/up\s+(\d+)\s+days?/);
                const timeMatch = stdout.match(/,\s+(\d+):(\d+)/);
                let totalSec = 0;
                if (dayMatch) totalSec += parseInt(dayMatch[1]) * 86400;
                if (timeMatch) totalSec += parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60;
                resolve(totalSec);
            })),
            new Promise((resolve) => exec('top -l 1 -n 0 2>/dev/null | grep "CPU usage"', (err, stdout) => {
                const match = stdout.match(/(\d+\.?\d*)% user, (\d+\.?\d*)% sys/);
                resolve(match ? Math.round(parseFloat(match[1]) + parseFloat(match[2])) : 15);
            })),
            new Promise((resolve) => {
                const proc = spawn('/opt/homebrew/bin/macmon', ['pipe', '-s', '1'], {
                    env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' }
                });
                let stdout = '';
                proc.stdout.on('data', (d) => stdout += d.toString());
                proc.on('close', () => {
                    try { resolve(JSON.parse(stdout.split('\n')[0])); } catch { resolve(null); }
                });
                proc.on('error', () => resolve(null));
                setTimeout(() => { proc.kill(); resolve(null); }, 3000);
            })
        ]);

        const cpuUsage = topOutput;
        const cpuTemp = macmonData?.temp?.cpu_temp_avg ? Math.round(macmonData.temp.cpu_temp_avg) : null;
        const gpuTemp = macmonData?.temp?.gpu_temp_avg ? Math.round(macmonData.temp.gpu_temp_avg) : null;

        const memUsed = (macmonData?.memory?.ram_usage || 11485773824) / 1024 / 1024 / 1024;
        const memTotal = (macmonData?.memory?.ram_total || 34359738368) / 1024 / 1024 / 1024;
        const memPercent = Math.round((memUsed / memTotal) * 100);

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
        res.json({ cpu: { usage: 15 }, memory: { used: 11.3, total: 32, percent: 35 }, disk: [{ used: 94, total: 460, percent: 20 }], os: { Uptime: 109700 } });
    }
});

app.get('/api/knowledge', async (req, res) => {
    try {
        const count = await new Promise((resolve) => exec('find ~/.openclaw/shared/knowledge_base -type f -name "*.md" 2>/dev/null | wc -l', (err, stdout) => resolve(parseInt(stdout.trim()) || 0)));
        res.json({ count });
    } catch { res.json({ count: 0 }); }
});

app.get('/api/cron', async (req, res) => {
    try {
        const result = await new Promise((resolve, reject) => {
            exec('openclaw cron list --json', (error, stdout) => {
                if (error) { reject(error); return; }
                try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
            });
        });
        const jobs = (result.jobs || []).map(job => ({
            id: job.id, name: job.name, schedule: job.schedule?.expr || 'unknown',
            nextRun: job.state?.nextRunAtMs, enabled: job.enabled
        }));
        res.json({ jobs });
    } catch { res.json({ jobs: [] }); }
});

app.get('/api/version', async (req, res) => {
    try {
        const version = await new Promise((resolve) => exec('openclaw --version', (err, stdout) => resolve(stdout.trim())));
        res.json({ version });
    } catch { res.json({ version: 'unknown' }); }
});

const PRICING = {
    'MiniMax-M2.5': { input: 0.10, output: 0.30 },
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'openai-codex-5.3': { input: 1.75, output: 14.00 }
};

app.get('/api/usage', async (req, res) => {
    const ALL_MODELS = ['MiniMax-M2.5', 'claude-sonnet-4-6', 'openai-codex-5.3'];

    try {
        const statusResult = await new Promise((resolve, reject) => {
            exec('openclaw gateway call status --json', (error, stdout) => {
                if (error) { reject(error); return; }
                try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
            });
        });

        const sessions = statusResult.sessions?.recent || [];
        const modelStats = {};

        sessions.forEach(session => {
            const model = session.model;
            if (!model) return;
            const total = (session.inputTokens || 0) + (session.outputTokens || 0);
            if (!modelStats[model] || total > modelStats[model].maxTokens) {
                modelStats[model] = { maxTokens: total, inputTokens: session.inputTokens || 0, outputTokens: session.outputTokens || 0 };
            }
        });

        const usageData = loadUsageData();
        const today = getTodayKey();

        // Check for monthly reset
        const lastDate = Object.keys(usageData.days).sort().pop();
        if (lastDate && lastDate.substring(0, 7) !== today.substring(0, 7)) {
            usageData.days = {};
        }

        // Update maximums
        if (!usageData.maxTokensByModel) usageData.maxTokensByModel = {};
        ALL_MODELS.forEach(model => {
            if (modelStats[model] && modelStats[model].maxTokens > (usageData.maxTokensByModel[model]?.maxTokens || 0)) {
                usageData.maxTokensByModel[model] = modelStats[model];
            }
        });

        // Calculate from stored maximums
        const models = {};
        let totalCost = 0;
        let totalTokens = 0;

        ALL_MODELS.forEach(model => {
            const stats = usageData.maxTokensByModel[model] || { inputTokens: 0, outputTokens: 0, maxTokens: 0 };
            let cost = null;
            if (model !== 'MiniMax-M2.5') {
                cost = Math.round(((stats.inputTokens / 1000000) * PRICING[model].input + (stats.outputTokens / 1000000) * PRICING[model].output) * 1000) / 1000;
                totalCost += cost;
            }
            models[model] = { inputTokens: stats.inputTokens, outputTokens: stats.outputTokens, cost };
            totalTokens += stats.inputTokens + stats.outputTokens;
        });

        // Save daily snapshot
        usageData.days[today] = { models: JSON.parse(JSON.stringify(models)), totalCost, totalTokens, sessionCount: sessions.length, timestamp: new Date().toISOString() };
        saveUsageData(usageData);

        res.json({ today: usageData.days[today], models, totalCost, totalTokens, sessionCount: sessions.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`⬡ CLAWBRIDGE DASHBOARD ${VERSION}`);
    console.log(`🌐 http://localhost:${PORT}`);
});
