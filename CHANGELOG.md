# Changelog

## v0.2.260308.1 - 2026-03-08
### Added
- Merged modules: Gateway+System Overview → "System Status", API Usage+Agents → "API & Agent Stats"
- Header refresh button (⟳) to refresh all modules without page reload
- Agent activity indicators: Active (green pulsing dot) / Idle (gray dot) based on session recency
- Updated module icons: System Status (⚡), API & Agent Stats (📊)
- Cron format fix: "Every 3 days at 10:00" for Google Drive Backup
- Fixed uptime display (was showing "--")
- Gateway version now stacked below Healthy status (centered)

## v0.2.260302.6 - 2026-03-02
### Fixed
- API Usage: Model name for Codex - gateway reports `gpt-5.3-codex`, not `openai-codex-5.3`

## v0.2.260302.5 - 2026-03-02
### Added
- Workspace architecture: Main + Finance tabs
- Tab navigation centered in header
- `workspaces/main/` - Main dashboard
- `workspaces/finance/` - Blank Finance workspace (future)
- `workspaces.js` - Workspace loader

### Fixed
- Removed "Updated:" timestamp from API Usage module

## v0.2.260302.4 - 2026-03-02
### Added
- Separate OpenClaw version (in Gateway module) vs Dashboard version (in footer)
- KB categories: Business, Finance, Personal, References
### Added
- Separate OpenClaw version (in Gateway module) vs Dashboard version (in footer)
- KB categories: Business, Finance, Personal, References

### Fixed
- API Usage "Updated:" timestamp field

## v0.2.260302.3 - 2026-03-02
### Added
- KB category breakdown (business, finance, personal, references)

## v0.2.260302.2 - 2026-03-02
### Added
- Dashboard version shown at bottom

## v0.2.260302.1 - 2026-03-02
### Fixed
- KB document count
