/**
 * Migrate seed agent names to real market model names.
 * Usage: DATABASE_URL=... npx tsx scripts/migrate-agent-names.ts
 *
 * Maps old fake names → real Arena-ranked model names.
 * Also adds new orgs (Google, xAI, GitHub) and new agents.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

// Old name → new name mapping
const agentRenames: Record<string, { name: string; reputation: number }> = {
  "claude-7a": { name: "claude-opus-4-6", reputation: 250 },
  "claude-3b": { name: "claude-sonnet-4-6", reputation: 200 },
  "gpt-4x": { name: "gpt-5.4-high", reputation: 230 },
  "cursor-3f": { name: "cursor-agent", reputation: 180 },
  "devin-2k": { name: "devin-v2", reputation: 165 },
  "copilot-9x": { name: "copilot-agent", reputation: 150 },
  "windsurf-1m": { name: "windsurf-wave-2", reputation: 140 },
  "claude-5c": { name: "claude-haiku-4-5", reputation: 110 },
  "gpt-mini-2a": { name: "gpt-5.4-mini", reputation: 120 },
  "cursor-7d": { name: "gemini-3-pro", reputation: 220 },
};

// New orgs to create
const newOrgs = ["Google", "xAI", "GitHub"];

// New agents to add after orgs exist
const newAgents = [
  { name: "grok-4.20-beta1", org: "xAI", reputation: 210 },
  { name: "gemini-3-flash", org: "Google", reputation: 130 },
  { name: "grok-3-mini", org: "xAI", reputation: 100 },
];

async function migrate() {
  console.log("Migrating agent names to real market models...\n");

  // 1. Create new orgs
  for (const orgName of newOrgs) {
    const apiKeyHash = `org_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const [existing] = await sql`SELECT id FROM organizations WHERE name = ${orgName}`;
    if (!existing) {
      await sql`INSERT INTO organizations (name, api_key_hash) VALUES (${orgName}, ${apiKeyHash})`;
      console.log(`  + org: ${orgName}`);
    } else {
      console.log(`  = org: ${orgName} (exists)`);
    }
  }

  // 2. Rename existing agents
  for (const [oldName, { name: newName, reputation }] of Object.entries(agentRenames)) {
    const [agent] = await sql`SELECT id, name FROM agents WHERE name = ${oldName}`;
    if (agent) {
      // For cursor-7d → gemini-3-pro, also need to change org
      if (oldName === "cursor-7d") {
        const [googleOrg] = await sql`SELECT id FROM organizations WHERE name = 'Google'`;
        if (googleOrg) {
          await sql`UPDATE agents SET name = ${newName}, reputation = ${reputation}, org_id = ${googleOrg.id} WHERE id = ${agent.id}`;
        } else {
          await sql`UPDATE agents SET name = ${newName}, reputation = ${reputation} WHERE id = ${agent.id}`;
        }
      } else if (oldName === "copilot-9x") {
        // copilot was under Codeium, move to GitHub
        const [githubOrg] = await sql`SELECT id FROM organizations WHERE name = 'GitHub'`;
        if (githubOrg) {
          await sql`UPDATE agents SET name = ${newName}, reputation = ${reputation}, org_id = ${githubOrg.id} WHERE id = ${agent.id}`;
        } else {
          await sql`UPDATE agents SET name = ${newName}, reputation = ${reputation} WHERE id = ${agent.id}`;
        }
      } else {
        await sql`UPDATE agents SET name = ${newName}, reputation = ${reputation} WHERE id = ${agent.id}`;
      }
      console.log(`  ✓ ${oldName} → ${newName} (rep: ${reputation})`);
    } else {
      console.log(`  - ${oldName} not found (skip)`);
    }
  }

  // 3. Add new agents
  for (const agent of newAgents) {
    const [existing] = await sql`SELECT id FROM agents WHERE name = ${agent.name}`;
    if (existing) {
      console.log(`  = agent: ${agent.name} (exists)`);
      continue;
    }
    const [org] = await sql`SELECT id FROM organizations WHERE name = ${agent.org}`;
    if (!org) {
      console.log(`  x agent: ${agent.name} — org ${agent.org} not found`);
      continue;
    }
    const expertise: Record<string, number> = {};
    const domains = ["typescript", "react", "node", "python", "rust", "go", "postgres", "docker"];
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      expertise[domains[Math.floor(Math.random() * domains.length)]] = Math.floor(Math.random() * 50) + 10;
    }
    await sql`
      INSERT INTO agents (name, org_id, reputation, domain_expertise)
      VALUES (${agent.name}, ${org.id}, ${agent.reputation}, ${JSON.stringify(expertise)})
    `;
    console.log(`  + agent: ${agent.name} (rep: ${agent.reputation})`);
  }

  // 4. Show final state
  const agents = await sql`SELECT a.name, a.reputation, o.name AS org FROM agents a JOIN organizations o ON a.org_id = o.id ORDER BY a.reputation DESC`;
  console.log("\n=== Final Agent Leaderboard ===");
  for (const a of agents) {
    console.log(`  ${String(a.reputation).padStart(3)} | ${a.name.padEnd(22)} | ${a.org}`);
  }

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*) FROM agents) AS agents,
      (SELECT COUNT(*) FROM organizations) AS orgs
  `;
  console.log(`\nTotal: ${stats.agents} agents, ${stats.orgs} orgs`);

  await sql.end();
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
