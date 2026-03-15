# QA Report: Agent-Hive Hub

| Field | Value |
|-------|-------|
| **URL** | https://agent-hive-hub.vercel.app |
| **Date** | 2026-03-15 |
| **Mode** | Full |
| **Duration** | ~8 minutes |
| **Pages Visited** | 7 (Landing, Pulse, Explore, Demand, Leaderboard, Graph Explorer, API Docs) |
| **Screenshots** | 10 |
| **Framework** | Vite + React SPA (client-side routing) |

---

## Health Score: 78/100

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Console | 70 | 15% | 10.5 |
| Links | 100 | 10% | 10.0 |
| Visual | 92 | 10% | 9.2 |
| Functional | 77 | 20% | 15.4 |
| UX | 92 | 15% | 13.8 |
| Performance | 92 | 10% | 9.2 |
| Content | 92 | 5% | 4.6 |
| Accessibility | 85 | 15% | 12.75 |
| **Total** | | | **78** |

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 2 |

---

## Top 3 Things to Fix

1. **ISSUE-001** — Landing page shows mock stats instead of live API data
2. **ISSUE-002** — Leaderboard "Since" column shows raw ISO timestamps
3. **ISSUE-003** — Demand Board shows only 1 of 3 "wanted" nodes as Open

---

## Issues

### ISSUE-001: Landing page hero stats show mock data, not live API data
**Severity:** High | **Category:** Functional

**Description:** The landing page stats section displays hardcoded mock numbers (12,847 nodes / 34,291 edges / 342 agents / 73/100 health) instead of the live API data (16 nodes / 8 edges / 10 agents / 47/100 health). The dashboard correctly shows live data, but the landing page does not.

**Impact:** First-time visitors see inflated fake numbers. When they click through to the dashboard, the real numbers are dramatically lower, undermining trust.

**Evidence:**
- Landing page: `screenshots/landing-desktop-recheck.png` — shows 12,847 / 34,291 / 342 / 73
- Dashboard: `screenshots/dashboard-pulse.png` — shows 16 / 8 / 10 / 47
- API response: `curl /api/v1/pulse` returns `total_nodes: 16, total_edges: 8`

**Repro:**
1. Navigate to https://agent-hive-hub.vercel.app
2. Observe stats: 12,847 TOTAL NODES, 34,291 TOTAL EDGES, 342 ACTIVE AGENTS, 73/100 GRAPH HEALTH
3. Click "Open Dashboard"
4. Observe stats: 16 Total Nodes, 8 Total Edges, 10 Active Agents, 47 Graph Health

---

### ISSUE-002: Leaderboard "Since" column shows raw timestamps
**Severity:** Medium | **Category:** Content

**Description:** The "Since" column in the leaderboard table displays raw ISO timestamps like `2026-03-15 04:55:40.917998` instead of a human-friendly format like "Mar 15, 2026" or "2d ago".

**Evidence:** `screenshots/dashboard-leaderboard.png`

**Repro:**
1. Navigate to /dashboard/leaderboard
2. Look at the "Since" column — shows `2026-03-15 04:55:40.917998`

---

### ISSUE-003: Demand Board shows inconsistent demand signal counts
**Severity:** Medium | **Category:** Functional

**Description:** The Demand Board shows "Open Demands: 1" but the seed data created 3 "wanted" nodes. The "All Demand Signals" section shows 3 items — 1 Open and 2 Filled. However, the demand data from `/api/v1/demand` may be computing fill status differently than expected, leading to only 1 showing as "Open."

Also, the "Fill Rate: 67%" and "Avg Time to Fill: 3.2d" metrics appear to be correctly calculated (2/3 = 67%), but the filled status may not accurately reflect whether answers actually exist for these wanted nodes.

**Evidence:** `screenshots/dashboard-demand.png`

---

### ISSUE-004: Grammar: "1 proofs" and "1 nodes" on leaderboard
**Severity:** Low | **Category:** Content

**Description:** The leaderboard podium cards and table show "1 proofs" and "1 nodes" instead of singular "1 proof" / "1 node" and "2 nodes" / "2 proofs" for correct pluralization.

**Evidence:** `screenshots/dashboard-leaderboard.png` — podium cards show "2 nodes / 1 proofs", "4 nodes / 1 proofs", "1 nodes / 0 proofs"

---

### ISSUE-005: Explore page search is client-side only (mock data)
**Severity:** Medium | **Category:** Functional

**Description:** The Explore page search box filters client-side mock data, not the live API search endpoint (`/api/v1/search`). Searching "drizzle" returns the mock "Drizzle ORM — Connection Pooling with Neon" snippet rather than the 4+ drizzle-related nodes in the actual database.

**Evidence:** `screenshots/explore-search.png` — search for "drizzle" returns 1 result from mock data. The API has drizzle-related question, answer, gotcha, and wanted nodes.

---

### ISSUE-006: Sidebar navigation missing on landing page
**Severity:** Low | **Category:** UX

**Description:** The landing page has a minimal top nav (Install, API, Dashboard) but no way to access individual dashboard pages directly. The footer also only links to GitHub, Docs, and Dashboard. This is a minor issue — users can get to specific pages via the dashboard sidebar.

**Evidence:** `screenshots/initial.png`

---

## Console Health

| Page | Errors | Notes |
|------|--------|-------|
| Landing | 2 | `recentActivity is not defined`, `demandSignals is not defined` (stale cache from pre-fix build; new build hash `BQtiByaK` is clean) |
| Dashboard/Pulse | 0 | Clean after fresh load |
| Dashboard/Explore | 0 | Clean |
| Dashboard/Demand | 0 | Clean |
| Dashboard/Leaderboard | 0 | Clean |
| Dashboard/Graph | 0 | Clean |
| Dashboard/Docs | 0 | Clean |

**Note:** The 2 console errors on landing were from the previous build (`index-D_RA2xih.js`). The current build (`index-BQtiByaK.js`) is clean. The Pulse.tsx fix (passing props to `ActivityFeed` and `DemandSignalsCard`) deployed successfully.

---

## Responsiveness

- **Landing page (375x812):** Good. Content stacks properly, CTAs visible, stats in 2x2 grid.
- **Dashboard (375x812):** Good. Sidebar collapses to hamburger menu. Cards stack in single/double column.

---

## Pages Tested

| Page | Status | Notes |
|------|--------|-------|
| Landing (`/`) | OK | Live stats from API visible on initial desktop screenshot; subsequent loads show mock |
| Pulse (`/dashboard`) | OK | Health ring, stat cards, compounding metrics, activity feed, demand signals, enricher status all render |
| Explore (`/dashboard/explore`) | OK | Type/trust filters work, search filters client-side, all node types display |
| Demand Board (`/dashboard/demand`) | OK | Heatmap, signal list, Open/Filled badges render |
| Leaderboard (`/dashboard/leaderboard`) | OK | Podium + table with all 10 agents, reputation bars |
| Graph Explorer (`/dashboard/graph`) | OK | Force-directed graph with 16 nodes, edges, labels, type color coding |
| API Docs (`/dashboard/docs`) | OK | 11 endpoints documented, sidebar nav, example requests/responses, "Try It" button |
