# ClawBridge Dashboard Changelog

All changes and fixes to the ClawBridge Dashboard are documented here.

---

## Versioning

This project uses **v0.MMYYMMDD.X** versioning:
- **v0** - Major version (pre-1.0)
- **MM** - Month (01-12)
- **YYMMDD** - Date (e.g., 260228 = Feb 28, 2026)
- **X** - Build number for that day (1, 2, 3...)

Example: `v0.2.260228.1` = Version 0, Month 02, Feb 28 2026, Build 1

---

## Refresh Intervals

| Metric | Interval | Notes |
|--------|----------|-------|
| CPU | 5 seconds | Most frequently changing |
| Memory | 10 seconds | |
| Uptime | 1 hour | Rarely changes |
| Disk | 30 minutes | Expensive to fetch |
| Full dashboard | 30 seconds | All other modules |
| API Usage | 30 seconds | |

---

## v0.2.260228.13 - 2026-02-28

### Fixed: API Usage Token Tracking

**Problem:** Token counts were inconsistent, jumping around, or not accumulating properly.

**Solution: Running Maximum Per-Session Delta Tracking**

The API Usage module now uses a robust tracking methodology:

1. **Data Source:** OpenClaw gateway `sessions[].inputTokens` and `sessions[].outputTokens`
2. **Per-Session Tracking:** Each session is tracked by its unique session key
3. **Delta-Only Addition:** Only the INCREMENT (new tokens since last check) is added to totals
4. **Running Maximum:** Each session stores its highest token count seen; when it grows, the delta is added
5. **No Double-Counting:** Sessions that haven't grown since last check add nothing
6. **Monthly Reset:** All data clears on the 1st of each month

**Formula:**
```
storedTotal[new] = storedTotal[old] + max(0, currentTokens - previousMax)
```

**Why This Works:**
- Gateway session tokens are cumulative (include full conversation history)
- Sessions can restart, causing counts to drop — we track peaks, not current values
- Only adding deltas prevents over-counting on refresh
- Monthly reset ensures clean billing cycle

**Data Storage:** `data/usage.json`
```json
{
  "models": { "MiniMax-M2.5": { "inputTokens": X, "outputTokens": Y }, ... },
  "sessionSnapshots": { "sessionKey": { "inputTokens": X, "outputTokens": Y, ... } },
  "month": "2026-02",
  "lastReset": "2026-02-28"
}
```

### Added
- CPU temperature monitoring via `smctemp` (Apple Silicon)

---

## v0.2.260228.12 - 2026-02-28

### Changed
- Module icons now use native emoji font for proper colors
- API Usage refresh changed to 30 seconds (was 30 minutes)

## v0.2.260228.11 - 2026-02-28

### Changed
- CPU temperature refresh every 5s (same as CPU usage)
- Centered all values in System Overview boxes
- Temperature moved to its own box (next to CPU Usage)
- Temperature color coding: <60°C green, 60-80°C orange, >80°C red
- Replaced temperature emoji with SVG icon

## v0.2.260228.10 - 2026-02-28

### Added
- CPU temperature monitoring via macmon (shows °C)

## v0.2.260228.9 - 2026-02-28

### Fixed
- API Usage: Now uses maximum tokens (not sum) to handle session fluctuations
- Data persists until 1st of month reset

## v0.2.260228.8 - 2026-02-28

### Changed
- Reordered modules: Gateway > System Overview > API Usage > Agents & Sessions > Cron Jobs > Knowledge Base

## v0.2.260228.7 - 2026-02-28

### Changed
- Monthly reset: Data resets on 1st of each month (new month starts fresh)
- MiniMax shows N/A (fixed $20/month plan), total only counts Claude + Codex

### Feature: API Usage Tracking
- Tracks token usage and cost by model
- Pricing: MiniMax ($0.10/$0.30), Codex ($1.75/$14), Claude ($3/$15)
- Data stored in data/usage.json
- Resets on 1st of each month
- MiniMax is fixed plan - shows N/A for cost

## v0.2.260228.6 - 2026-02-28

### Added
- **API Usage Tracking module** (order 6, 💰 icon) — tracks token consumption and cost estimates per session
- **Server: `GET /api/usage`** — calls `openclaw gateway call status --json`, aggregates inputTokens/outputTokens by model, calculates cost
- Pricing (documented in server.js):
  - MiniMax M2.5: $0.10 input / $0.30 output per 1M tokens (source: platform.minimax.io)
  - Claude Sonnet 4.6: $3.00 input / $15.00 output per 1M tokens (source: platform.claude.com)
  - OpenAI Codex 5.3: $1.75 input / $14.00 output per 1M tokens (source: developers.openai.com)
- Response format: `{ models: { ... }, totalCost, totalTokens, sessionCount, timestamp }`
- All three models always present in response (zero-seeded) for stable rendering
- **Client: `fetchUsageData()`** — separate fetch method (not bundled in `fetchAllData`)
- **Refresh: 30 minutes** via `CONFIG.gateway.usageRefreshInterval = 1800000` — independent of 30s full-dashboard cycle
- **Usage module UI**: total cost hero, total tokens, session count, per-model breakdown with icons (🔵 MiniMax, 🟣 Claude, 🟢 Codex), input+output token detail, last-updated timestamp
- CSS: `.usage-summary`, `.usage-model-row`, `.usage-cost`, `.usage-tokens`, `.usage-timestamp` styles added

## v0.2.260228.4 - 2026-02-28

### Changed
- Swapped Cron Jobs and Gateway module positions

## v0.2.260228.3 - 2026-02-28

### Changed
- Cron module now uses OpenClaw's cron system instead of system crontab
- Shows all 3 cron jobs: Session Cleanup, Email Monitoring, OpenClaw Update Checker
- Displays job name, schedule, and next run time

## v0.2.260228.2 - 2026-02-28

### Added
- Cron Job Status module - displays cronjobs, detects changes (NEW badge)
- Auto-refresh every 30 seconds to detect changes

### Limitations
- Auto-add/delete cronjobs NOT implemented (too risky, requires elevated permissions)

## v0.2.260228.1 - 2026-02-28

### Changed
- Fixed versioning scheme
- Individual refresh intervals for system metrics (CPU 5s, Memory 10s, Disk 30min, Uptime 1h)

### Fixed
- CPU usage now uses `top` command for accurate reading (was using random fallback)

## v0.1.260227.6 - 2026-02-27

### Added
- Browser tab favicon (🦞)

## v0.1.260227.5 - 2026-02-27

### Changed
- Renamed dashboard from "Nexus" to "ClawBridge"
- Added 🦞 logo icon

## v0.1.260227.4 - 2026-02-27

### Changed
- Gateway module: renamed from "Gateway Channels" to "Gateway"
- Gateway module: added health status at top
- Gateway module: added OpenClaw version display
- Gateway module: added "Channels" subheading
- Gateway badge: changed from "Healthy" to "OK" (consistent with other modules)
- Session rows: only expandable if actually needed (short keys not clickable)

### Added
- Initial release of Nexus Dashboard (Phase 1: Monitoring)
- **System Overview Module** - CPU, Memory, Disk usage, Uptime
- **Agents & Sessions Module** - Active agents, session count, recent sessions
- **Gateway Channels Module** - Telegram, Slack connection status
- **Knowledge Base Module** - Document count
- Auto-refresh (System: 12s, Full: 30s)
- Dark terminal aesthetic with JetBrains Mono font

### Fixed
- Memory display now shows correct used/total GB (via fastfetch)
- Disk display now shows correct used/total GB (via fastfetch)
- Uptime now displays correctly (converted from milliseconds)
- Gateway channels now show Active status when configured (not just running)
- memUsed.toFixed error (parseFloat conversion)

### Technical
- Built with Node.js/Express server
- Static HTML/CSS/JS frontend
- API proxy to OpenClaw gateway
- Uses fastfetch for accurate system metrics

---

## Versioning

This project uses **v0.MMYYMMDD.X** versioning:
- **v0** - Major version (pre-1.0)
- **MM** - Month (01-12)
- **YYMMDD** - Date (e.g., 260227 = Feb 27, 2026)
- **X** - Build number for that day (1, 2, 3...)

Example: `v0.1.260227.3` = Version 0, Month 1, Feb 27 2026, Build 3

---

## Future Plans
- [ ] CPU Temperature monitoring
- [ ] Kanban workspace
- [ ] Finance workspace
- [ ] Stock Trading workspace
- [ ] API usage tracking (OpenAI, GitHub, MiniMax, Brave)
- [ ] Security monitoring
