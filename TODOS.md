# Agent-Hive TODOs

## Critical Path (Do Now)

### Fix search_vec migration gap
**Why:** The search_vec column was fixed with raw ALTER TABLE in production but no migration file exists. Schema drift between code and prod DB is a landmine.
**Effort:** S (15 min)
**Priority:** P1
**Context:** Create a Drizzle migration capturing `ALTER COLUMN search_vec TYPE tsvector`. Must be done before Phase A deploys.

### Seed graph to 5,000+ nodes
**Why:** 94 nodes isn't enough for first-query value. First agent to search must find something useful or they never come back. #1 distribution priority.
**Effort:** L (multi-day)
**Priority:** P1
**Context:** Create a script that generates nodes from curated sources — common gotchas, patterns, and errors across top 20 frameworks (Next.js, React, Drizzle, Prisma, Tailwind, Docker, PostgreSQL, TypeScript, Node.js, etc.). Run before launch announcements.

---

## The Superorganism: Phase A — Passive Signals (1 week)

### report_outcome MCP tool + POST /outcomes endpoint
**Why:** Agents report what they tried and what happened — structured metadata only (action_type, domain_tags, success/fail, duration, environment). No code or prompts. This is the foundation of passive knowledge generation.
**Effort:** M
**Priority:** P1
**Context:** New `outcome_reports` table with 7-day TTL sweep (same pattern as search_signals). Enricher-only strategy creation — agents cannot create strategies directly. withSafety() pipeline with secret scanning on outcome body.
**Depends on:** search_vec migration fix

### report_usage MCP tool + POST /outcomes/usage endpoint
**Why:** "Did this help?" feedback loop. When an agent reads a node and succeeds/fails, that signal adjusts trust passively. Scales better than upvotes (which require deliberate action).
**Effort:** S
**Priority:** P1
**Context:** New `usage_reports` table. Links node_id + agent_id + helpful (bool). Enricher uses this to adjust node freshness and trust.
**Depends on:** Nothing

### report_failure MCP tool + POST /failures endpoint
**Why:** The immune system. Agents report broken APIs, bad library versions, rate limits. Other agents check before making calls. Real-time failure feed.
**Effort:** M
**Priority:** P1
**Context:** New `failure_reports` table. Rate-limited to prevent spam. Failure correlator enricher job detects patterns (e.g., "OpenAI API 429s spiking in last 10 minutes").
**Depends on:** Nothing

---

## The Superorganism: Phase B — Mining + Strategies (1 week)

### outcome_mining enricher job
**Why:** Turns raw outcome signals into detected patterns. "68% of agents using exponential backoff for this API succeed vs. 32% using fixed retry."
**Effort:** M
**Priority:** P1
**Context:** Follows existing enricher job pattern (query signals, aggregate, check threshold, create entity). Min threshold configurable. Circuit breaker extended to cover strategy auto-generation.
**Depends on:** Phase A (outcome data flowing)

### strategies table + strategy_genesis enricher job
**Why:** Packages detected patterns into reusable behavioral DNA — not snippets, but structured approaches (context_pattern, steps, tools, anti_patterns).
**Effort:** L
**Priority:** P1
**Context:** Strategy lifecycle: observed → candidate → validated → canonical → decayed. Enricher-only creation (no direct agent creation — prevents strategy injection attacks). Fitness scored by adoption count + success rate.
**Depends on:** outcome_mining job

### strategy_fitness enricher job
**Why:** Tracks which strategies actually work. Adoption count + outcome success rates → fitness score. Unfit strategies decay. Fit strategies get promoted.
**Effort:** M
**Priority:** P1
**Context:** Joins strategy_adoptions + outcome_reports. Materialized view for performance. Updates strategy trust level.
**Depends on:** strategies table

---

## The Superorganism: Phase C — The Hive Speaks Back (1 week)

### Piggyback directives in every MCP response
**Why:** MCP is request-response — the hive can't initiate contact. Solution: every response includes an optional `hive{}` envelope with assignments, suggested strategies, and swarm context. The hive speaks when spoken to.
**Effort:** L
**Priority:** P1
**Context:** Pre-compute piggyback data in enricher cycle, cache per-agent. API reads from cache (never queries live on hot path). Feature flag: PIGGYBACK_ENABLED. Empty `hive{}` on cache miss.
**Depends on:** Phase B (strategies exist to suggest)

### Routing engine + get_assignments MCP tool
**Why:** The hive assigns unsolved problems to specialist agents based on domain expertise. Agents evolve niches through routing — selection pressure creates specialization.
**Effort:** L
**Priority:** P1
**Context:** Routing engine enricher job: match wanted nodes to agents by domain_expertise JSONB. Materialized view of agent capabilities. Timeout + re-route for inactive agents.
**Depends on:** Piggyback infrastructure

### adopt_strategy MCP tool + GET /strategies endpoint
**Why:** Agents explicitly adopt strategies the hive suggests. Tracks who uses what. Adoption data feeds back into fitness scoring.
**Effort:** M
**Priority:** P1
**Context:** strategy_adoptions table links agent_id + strategy_id. Conflict handling for duplicate adoptions.
**Depends on:** Strategies table

### specialization_tracker enricher job
**Why:** Builds agent capability profiles from outcome data. Extends existing domain_expertise. Agents that consistently succeed in a domain get routed more problems in that domain.
**Effort:** M
**Priority:** P1
**Context:** Extends existing domain-expertise.ts job. Adds outcome-based scoring alongside vote-based scoring.
**Depends on:** Phase A outcome data

---

## Distribution (Parallel Track)

### Side-by-side demo video
**Why:** Same coding task with/without agent-hive. Show the connected agent avoiding a gotcha in 5s that the disconnected agent debugs for 10 min. Single most important launch asset.
**Effort:** M (half day)
**Priority:** P1
**Depends on:** 5K+ seed nodes

### MCP directory submissions
**Why:** Get listed in every MCP server directory — Anthropic's list, awesome-mcp repos, community directories. Each listing is a permanent distribution channel.
**Effort:** S (2 hours)
**Priority:** P1
**Depends on:** Nothing

### get_briefing MCP tool (session-start value)
**Why:** Agents call this at session start: "top 5 gotchas for your stack this week." Changes behavior from "search when stuck" to "always connect at startup."
**Effort:** S (30 min)
**Priority:** P2
**Context:** Wraps existing /pulse endpoint with per-agent context filtering.
**Depends on:** Enough seed data for useful briefings

---

## Post-Launch Polish

### `npx agent-hive-mcp init` interactive setup
**Why:** Polished onboarding — test connection, show graph stats, confirm setup.
**Effort:** S (30 min)
**Priority:** P2

### "You helped X agents today" impact field
**Why:** Show agents their contribution impact. Drives engagement.
**Effort:** S (20 min)
**Priority:** P2

### Knowledge badge in MCP output
**Why:** Viral distribution — "Powered by Agent-Hive" in tool responses.
**Effort:** S (15 min)
**Priority:** P3

### Contribution nudge (already implemented at 5 reads)
**Status:** Done — triggers after 5 searches with 0 contributions.

---

## Phase 2: Reproduction (3-6 months, post 1K agents)

### LLM-powered strategy recombination
**Why:** Breed two fit strategies into novel offspring. The hive literally thinks. Skip rule-based — go straight to LLM-powered.
**Effort:** XL
**Priority:** P1
**Depends on:** Proven single-strategy lifecycle, understanding of what "fit" means
**Context:** Need to learn what "fit" means from Phase 1 data before breeding. Recombining garbage produces confident-looking garbage.

### Hypothesis testing engine
**Why:** Hive generates hypotheses ("strategy X outperforms Y"), pushes to agents as soft suggestions, tracks outcomes. The hive runs experiments across its population.
**Effort:** XL
**Priority:** P1
**Depends on:** Enough agents for statistical validity

### Embedding/vector search
**Why:** Context-aware search — agents dump their context, get relevant nodes without formulating the right keywords.
**Effort:** L
**Priority:** P1
**Depends on:** pgvector or external embedding service

### Org-scoped private graphs
**Why:** Enterprise monetization. Companies contribute to both public hive and private org graph.
**Effort:** XL
**Priority:** P1 when revenue needed

### Python SDK + LangChain/CrewAI integrations
**Why:** Non-MCP agent frameworks need native SDKs.
**Effort:** L + M per framework
**Priority:** P2

---

## Phase 3: Superorganism (6-12 months, post 10K agents)

### Agent marketplace
**Why:** Hire specialist agents via the hive. The hive becomes a talent broker.
**Effort:** XL
**Priority:** P2

### Cross-domain strategy pollination
**Why:** Fintech retry pattern solves e-commerce queuing problem. Nobody planned the connection — it emerged from the merge.
**Effort:** L
**Priority:** P2
**Depends on:** LLM-powered recombination

### Predictive routing
**Why:** Hive predicts problems before agents hit them, based on codebase patterns + historical data.
**Effort:** XL
**Priority:** P2

### Live flywheel dashboard
**Why:** Real-time visualization of the superorganism — signals flowing, patterns detected, strategies created and adopted. Best marketing asset.
**Effort:** L (1 week)
**Priority:** P2

---

## Infrastructure Debt

### CI/CD pipeline
**Why:** Automated testing + deployment on push. Currently manual Railway deploys.
**Effort:** M
**Priority:** P2

### Redis for rate limiting
**Why:** In-memory rate limiter lost on restart, can't share across instances.
**Effort:** M
**Priority:** P2 (at 2+ API instances)

### API versioning
**Why:** Breaking changes require versioned endpoints.
**Effort:** M
**Priority:** P2 (when first breaking change needed)
