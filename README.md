# Nexus Dashboard

> A modular IT/technical command center for monitoring agents, systems, and company resources.

## Overview

**Nexus** is a web-based dashboard designed for the AI Corp agent swarm. It provides real-time monitoring of:

- System resources (CPU, memory, disk, uptime)
- Agent status and activity
- Gateway health and channels
- Knowledge base statistics

## Features

- 🖥️ **Dark Terminal Aesthetic** — Modern, technical look with JetBrains Mono font
- 📱 **Responsive Design** — Works on desktop and mobile
- 🔄 **Auto-Refresh** — Polls data every 30 seconds
- 🔌 **Modular Architecture** — Easy to add/remove monitoring modules
- 🎨 **Configurable** — Enable/disable modules via `js/config.js`

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Open **http://localhost:3000** in your browser.

## Project Structure

```
dashboard-corp/
├── index.html          # Main dashboard HTML
├── server.js           # Express server + API proxies
├── package.json        # Node.js dependencies
├── css/
│   └── style.css       # Dark theme styling
└── js/
    ├── config.js       # Module configuration
    └── app.js          # Main application logic
```

## Configuration

Edit `js/config.js` to:

- Enable/disable modules
- Change refresh interval
- Configure module titles and icons

```javascript
modules: {
    system: { enabled: true, title: 'System Overview', order: 1 },
    agents: { enabled: true, title: 'Agent Status', order: 2 },
    // ...
}
```

## API Endpoints

The server provides these endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Server health check |
| `GET /api/gateway/:method` | Proxy to OpenClaw gateway |
| `GET /api/system` | Local system metrics |
| `GET /api/knowledge` | Knowledge base stats |

## Tech Stack

- **Frontend:** Vanilla JavaScript, CSS Grid, Flexbox
- **Backend:** Node.js, Express
- **Data:** OpenClaw Gateway CLI, macOS system commands
- **Font:** JetBrains Mono

## Future Phases

- [ ] Kanban workspace for task tracking
- [ ] Stock trading workspace (CFO agent)
- [ ] Finance workspace (budget tracking)
- [ ] API usage tracking (OpenAI, GitHub, MiniMax)
- [ ] Security monitoring (firewall, SSH attempts)

## License

MIT
