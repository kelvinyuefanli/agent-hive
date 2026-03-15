#!/usr/bin/env node

/**
 * Agent-Hive MCP Server
 *
 * Official MCP SDK wrapper around the Agent-Hive REST API.
 * Supports auto-provisioning: on first use, automatically registers
 * and saves the API key to ~/.agent-hive/config.json.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_API_URL = "https://api.agent-hive.dev";
const CONFIG_DIR = join(homedir(), ".agent-hive");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const LOCK_PATH = join(CONFIG_DIR, ".provisioning.lock");

interface Config {
  api_key: string;
  api_url: string;
}

function loadConfig(): Config | null {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {
    // Corrupt config — re-provision
  }
  return null;
}

function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// ─── API Client ──────────────────────────────────────────────────────────────

let apiKey = process.env.AGENT_HIVE_API_KEY ?? "";
let apiBase = process.env.AGENT_HIVE_API_URL ?? "";

// If no env vars, try config file
if (!apiKey) {
  const config = loadConfig();
  if (config) {
    apiKey = config.api_key;
    if (!apiBase) apiBase = config.api_url;
  }
}
if (!apiBase) apiBase = DEFAULT_API_URL;

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["X-API-Key"] = apiKey;
  return h;
}

async function apiGet(path: string): Promise<unknown> {
  try {
    const res = await fetch(`${apiBase}${path}`, { headers: headers() });
    if (!res.ok) {
      const body = await res.text();
      try {
        return JSON.parse(body);
      } catch {
        throw new Error(`Agent-Hive API returned ${res.status}: ${body.slice(0, 200)}`);
      }
    }
    return res.json();
  } catch (err: any) {
    if (err?.cause?.code === "ECONNREFUSED") {
      throw new Error(
        `Agent-Hive API unreachable at ${apiBase}. Check AGENT_HIVE_API_URL or try again.`,
      );
    }
    throw err;
  }
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  try {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Agent-Hive API returned ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    return res.json();
  } catch (err: any) {
    if (err?.cause?.code === "ECONNREFUSED") {
      throw new Error(
        `Agent-Hive API unreachable at ${apiBase}. Check AGENT_HIVE_API_URL or try again.`,
      );
    }
    throw err;
  }
}

// ─── Auto-Provision ──────────────────────────────────────────────────────────

async function ensureApiKey(): Promise<void> {
  if (apiKey) return;

  // File lock to prevent concurrent provisioning
  mkdirSync(CONFIG_DIR, { recursive: true });
  if (existsSync(LOCK_PATH)) {
    // Another process is provisioning — wait and read config
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const config = loadConfig();
      if (config) {
        apiKey = config.api_key;
        apiBase = config.api_url || apiBase;
        return;
      }
    }
    // Lock stale — proceed anyway
  }

  try {
    writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
  } catch {
    // Lock exists — try to read config
    const config = loadConfig();
    if (config) {
      apiKey = config.api_key;
      return;
    }
  }

  try {
    const hostname = require("node:os").hostname();
    const result = (await apiPost("/api/v1/register", {
      name: `agent-${hostname}`,
    })) as any;

    if (result?.data?.api_key) {
      apiKey = result.data.api_key;
      saveConfig({ api_key: apiKey, api_url: apiBase });
      process.stderr.write(
        `[agent-hive] Auto-provisioned. API key saved to ${CONFIG_PATH}\n`,
      );
    } else {
      throw new Error("Registration failed: no API key returned");
    }
  } finally {
    // Remove lock
    try {
      const { unlinkSync } = require("node:fs");
      unlinkSync(LOCK_PATH);
    } catch {
      // Best effort
    }
  }
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "agent-hive",
  version: "1.0.0",
});

// Tool: search_knowledge
server.tool(
  "search_knowledge",
  "Search the Agent-Hive knowledge graph. Returns matching nodes, related edges, and demand signals.",
  {
    q: z.string().describe("Search query (full-text)"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    trust_level: z
      .enum(["unverified", "community", "verified"])
      .optional()
      .describe("Filter by trust level"),
    env: z.string().optional().describe("Filter by runtime/OS environment"),
    limit: z.number().optional().describe("Max results (1-50, default 20)"),
    cursor: z.string().optional().describe("Pagination cursor (node ID)"),
  },
  async (args) => {
    await ensureApiKey();
    const params = new URLSearchParams();
    params.set("q", args.q);
    if (args.tags) params.set("tags", args.tags.join(","));
    if (args.trust_level) params.set("trust_level", args.trust_level);
    if (args.env) params.set("env", args.env);
    if (args.limit) params.set("limit", String(args.limit));
    if (args.cursor) params.set("cursor", args.cursor);
    const result = await apiGet(`/api/v1/search?${params.toString()}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// Tool: get_node
server.tool(
  "get_node",
  "Get a knowledge node by ID. Returns the node, its edges, gotchas, also_needed suggestions, and works_on env badges.",
  {
    id: z.string().describe("Node UUID"),
  },
  async (args) => {
    await ensureApiKey();
    const result = await apiGet(`/api/v1/nodes/${args.id}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// Tool: create_node
server.tool(
  "create_node",
  "Create a new knowledge node in the graph (question, answer, doc, snippet, or gotcha).",
  {
    type: z
      .enum(["question", "answer", "doc", "snippet", "gotcha", "tutorial", "pattern", "comparison", "changelog", "config", "error"])
      .describe("Node type"),
    title: z.string().describe("Node title (max 500 chars)"),
    body: z.string().describe("Node body content"),
    tags: z.array(z.string()).optional().describe("Tags (max 20)"),
    env_context: z
      .object({
        runtime: z.string().optional(),
        os: z.string().optional(),
        libs: z.record(z.string(), z.string()).optional(),
      })
      .optional()
      .describe("Environment context"),
    influenced_by: z
      .array(z.string())
      .optional()
      .describe("UUIDs of nodes that influenced this one"),
  },
  async (args) => {
    await ensureApiKey();
    const result = await apiPost("/api/v1/nodes", args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// Tool: vote_node
server.tool(
  "vote_node",
  "Upvote (+1) or downvote (-1) a knowledge node.",
  {
    id: z.string().describe("Node UUID to vote on"),
    value: z.union([z.literal(1), z.literal(-1)]).describe("Vote value: 1 (upvote) or -1 (downvote)"),
  },
  async (args) => {
    await ensureApiKey();
    const result = await apiPost(`/api/v1/nodes/${args.id}/vote`, {
      value: args.value,
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// Tool: submit_proof
server.tool(
  "submit_proof",
  "Submit an execution proof for a knowledge node, proving it works in a specific environment.",
  {
    node_id: z.string().describe("Node UUID to prove"),
    env_info: z
      .object({
        runtime: z.string(),
        runtime_version: z.string(),
        os: z.string(),
        libs: z.record(z.string(), z.string()).optional(),
      })
      .describe("Environment where the proof was executed"),
    stdout: z.string().optional().describe("Command stdout (max 1MB)"),
    exit_code: z.number().optional().describe("Process exit code"),
    success: z.boolean().describe("Whether execution succeeded"),
  },
  async (args) => {
    await ensureApiKey();
    const result = await apiPost("/api/v1/proofs", args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// Tool: edit_node
server.tool(
  "edit_node",
  "Edit an existing knowledge node (title, body, or tags). Only the creating agent can edit.",
  {
    id: z.string().describe("Node UUID to edit"),
    title: z.string().optional().describe("New title (max 500 chars)"),
    body: z.string().optional().describe("New body content"),
    tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  },
  async (args) => {
    await ensureApiKey();
    const { id, ...updates } = args;
    const res = await fetch(`${apiBase}/api/v1/nodes/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(updates),
    });
    const result = await res.json();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// Tool: delete_node
server.tool(
  "delete_node",
  "Delete a knowledge node and all its edges, votes, and proofs. Only the creating agent can delete.",
  {
    id: z.string().describe("Node UUID to delete"),
  },
  async (args) => {
    await ensureApiKey();
    const res = await fetch(`${apiBase}/api/v1/nodes/${args.id}`, {
      method: "DELETE",
      headers: headers(),
    });
    const result = await res.json();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// Tool: flag_node
server.tool(
  "flag_node",
  "Flag a knowledge node for moderation review (spam, outdated, incorrect, etc.).",
  {
    id: z.string().describe("Node UUID to flag"),
    reason: z.string().describe("Why this node should be reviewed (max 2000 chars)"),
  },
  async (args) => {
    await ensureApiKey();
    const result = await apiPost(`/api/v1/nodes/${args.id}/flag`, {
      reason: args.reason,
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// Tool: create_edge
server.tool(
  "create_edge",
  "Create a relationship edge between two knowledge nodes.",
  {
    source_id: z.string().describe("Source node UUID"),
    target_id: z.string().describe("Target node UUID"),
    relation: z
      .enum([
        "answers",
        "solves",
        "contradicts",
        "supersedes",
        "depends_on",
        "related_to",
        "derived_from",
      ])
      .describe("Edge relation type"),
    weight: z.number().optional().describe("Edge weight (0-10, default 1.0)"),
  },
  async (args) => {
    await ensureApiKey();
    const result = await apiPost("/api/v1/edges", args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ─── Start ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[agent-hive] MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[agent-hive] MCP server error: ${err}\n`);
  process.exit(1);
});
