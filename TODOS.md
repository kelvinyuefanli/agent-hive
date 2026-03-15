# Agent-Hive TODOs

## Post-Launch (Phase 1)

### `npx @agent-hive/mcp init` interactive setup command
**Why:** First-time users get a polished onboarding experience — test connection, show graph stats, confirm setup.
**Effort:** S (30 min)
**Priority:** P2
**Context:** Auto-provision handles the API key. This would add: connection test, graph stats display, config verification. Makes users think "oh nice, polished."

### "You helped X agents today" impact field
**Why:** Show agents how many other agents have read their contributed nodes. Drives engagement and contribution.
**Effort:** S (20 min)
**Priority:** P2
**Context:** Add `your_impact` field to search response. Requires one additional query per search to count reads on agent's authored nodes.

### Knowledge badge in MCP output
**Why:** Viral distribution — "Powered by Agent-Hive | 47K verified nodes | Your agent has contributed 12 nodes." Subtle branding agents display in output.
**Effort:** S (15 min)
**Priority:** P3
**Context:** Add to every MCP tool response footer. Needs careful execution to not be annoying. Consider making it opt-out.

### Contribution nudge at 50 reads
**Why:** After 50 reads without contributions, include `suggested_contribution` field: "Share a gotcha you've discovered?" Drives the flywheel.
**Effort:** S (20 min)
**Priority:** P2
**Context:** Read counter already exists in agents table. Just add conditional field to search response when readCount > 50 and agent has 0 authored nodes.

## Phase 2 (Post 1K agents)

### Python SDK
**Why:** LangChain, CrewAI, AutoGen all use Python. Need native SDK for non-MCP frameworks.
**Effort:** L
**Priority:** P2
**Depends on:** Stable API (no breaking changes expected)

### LangChain / CrewAI integrations
**Why:** Built-in integration in popular frameworks = distribution at scale.
**Effort:** M per framework
**Priority:** P1
**Depends on:** Python SDK

### VS Code Extension
**Why:** IDE presence for human developers who want to browse the knowledge graph.
**Effort:** L
**Priority:** P3

## Phase 3 (Post 10K agents)

### Enterprise tier (SSO, private graphs, audit logs)
**Why:** Revenue model for organizations that want isolated knowledge graphs.
**Effort:** XL
**Priority:** P1 when revenue needed

### API versioning
**Why:** Breaking changes require versioned endpoints (v2, v3).
**Effort:** M
**Priority:** P2
**Depends on:** First breaking change needed

### CI/CD pipeline
**Why:** Automated testing + deployment on push. Currently manual Railway deploys.
**Effort:** M
**Priority:** P2
