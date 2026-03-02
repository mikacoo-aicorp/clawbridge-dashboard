# Dashboard Workspace Architecture

## Overview
Split the single-page dashboard into a multi-workspace system with tab navigation.

---

## Approach: Option A - Client-Side Routing

**Decision:** Use client-side workspace switching within a single HTML page.

**Why:**
- Simpler than multiple HTML files
- Shared server.js and static assets
- Fast tab switching (no page reload)
- Easier state management

**Tradeoffs vs Options:**
- Option B (separate HTML): More files, shared API but duplicated nav/footer
- Option C (route handlers): Over-engineered for 2-3 workspaces

---

## Proposed File Structure

```
/dashboard-corp/
├── index.html              # Main entry with tab nav + workspace container
├── server.js               # Workspace routing + API endpoints
├── css/
│   └── style.css           # Shared styles + workspace-specific
├── js/
│   ├── app.js              # Main dashboard logic (current)
│   └── workspaces.js       # NEW: Tab navigation + workspace loader
├── workspaces/
│   ├── main/               # Current dashboard (moved)
│   │   ├── js/dashboard.js # Main workspace logic (copy of app.js, cleaned)
│   │   └── css/dashboard.css
│   └── finance/            # NEW: Finance workspace (blank shell)
│       ├── index.html      # Finance workspace HTML
│       ├── js/finance.js   # Finance workspace logic
│       └── css/finance.css # Finance workspace styles
```

---

## Backend API Design

### Existing (keep):
- `/api/gateway/health` - Gateway status
- `/api/gateway/status` - Agent sessions
- `/api/system` - CPU, RAM, disk
- `/api/knowledge` - KB stats
- `/api/cron` - Cron jobs
- `/api/usage` - API usage
- `/api/version` - OpenClaw version
- `/api/dashboard-version` - Dashboard version

### NEW Finance Endpoints:
```
GET /api/finance/quote?ticker=AAPL
Response: { symbol, price, change, changePercent, volume, marketCap, pe, ... }

GET /api/finance/historical?ticker=AAPL&period=1y&interval=1d
Response: { timestamps[], opens[], highs[], lows[], closes[], volumes[] }

GET /api/finance/search?q=apple
Response: [{ symbol, name, type, exchange }, ...]

GET /api/finance/portfolio
Response: { holdings: [{ symbol, shares, avgCost, currentPrice, value, gainLoss }, ...] }

POST /api/finance/portfolio
Body: { symbol, shares, avgCost }
Response: { success }
```

### yfinance Integration:
- Install: `pip install yfinance` (add to requirements.txt or install at runtime)
- Server-side: import yfinance, cache responses for 15-60 seconds
- Why server-side? CORS issues with yfinance from browser, plus caching

---

## Frontend Changes

### Tab Navigation (index.html)
```html
<nav class="workspace-tabs">
    <button class="tab active" data-workspace="main">Main</button>
    <button class="tab" data-workspace="finance">Finance</button>
</nav>
<div id="workspace-container"></div>
```

### Workspace Loader (workspaces.js)
```javascript
const workspaces = {
    main: { url: '/workspaces/main/', title: 'Main' },
    finance: { url: '/workspaces/finance/', title: 'Finance' }
};

function loadWorkspace(name) {
    // Fetch workspace HTML, inject into container
    // Update active tab
    // Store in localStorage for persistence
}
```

### Main Workspace
- Move current dashboard logic to `workspaces/main/`
- Keep working exactly as before

### Finance Workspace (Blank Shell)
- Basic HTML structure
- Placeholder for future: ticker search, chart, portfolio table
- Will integrate yfinance + TradingView later

---

## Implementation Steps

### Phase 1: Infrastructure (this PR)
1. Create `workspaces/` directory structure
2. Move Main dashboard to `workspaces/main/`
3. Add tab navigation to main index.html
4. Add workspace loader (workspaces.js)
5. Create blank Finance workspace
6. Update server.js to serve workspaces statically

### Phase 2: Finance Features (future)
1. Install yfinance, add API endpoints
2. Add ticker search component
3. Add TradingView chart embedding
4. Add portfolio management

---

## CSS Changes

Add to style.css:
```css
.workspace-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
}

.workspace-tabs .tab {
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px 4px 0 0;
}

.workspace-tabs .tab.active {
    background: var(--bg-primary);
    color: var(--text-primary);
}

#workspace-container {
    padding: 16px;
}
```

---

## Backward Compatibility

- All existing API endpoints unchanged
- Main workspace works exactly as before
- URL doesn't change (single page app)
- Refresh restores last active workspace (localStorage)
