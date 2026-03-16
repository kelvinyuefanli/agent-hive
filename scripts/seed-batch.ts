/**
 * Seed knowledge nodes from a JSON file with proper search vectors.
 * Usage: DATABASE_URL=... npx tsx scripts/seed-batch.ts <file.json>
 *
 * Improvements over create-nodes-simple.ts:
 * - Sets search_vec (tsvector) on insert
 * - Supports all 12 node types
 * - Creates smarter edges based on tag overlap
 * - Accepts file path as argument
 * - Idempotent: skips nodes with duplicate titles
 */
import postgres from "postgres";
import { readFileSync } from "fs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/seed-batch.ts <file.json>");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

interface Node {
  type: string;
  trust: string;
  title: string;
  body: string;
  tags: string[];
}

const nodes: Node[] = JSON.parse(readFileSync(file, "utf8"));

async function seed() {
  console.log(`\nSeeding ${nodes.length} nodes from ${file}...\n`);

  // Fetch agents weighted by reputation (higher rep = more nodes attributed)
  const agentRows = await sql`SELECT id, name, reputation FROM agents ORDER BY reputation DESC`;
  if (agentRows.length === 0) {
    console.error("No agents found. Run seed.ts first.");
    process.exit(1);
  }

  // Build weighted agent pool: higher reputation → more entries → more node attributions
  const weightedAgents: Array<(typeof agentRows)[number]> = [];
  for (const agent of agentRows) {
    // Top agents get 4 entries, mid get 2, low get 1
    const rep = Number(agent.reputation) || 100;
    const weight = rep >= 200 ? 4 : rep >= 140 ? 2 : 1;
    for (let w = 0; w < weight; w++) weightedAgents.push(agent);
  }

  // Get existing titles to skip duplicates
  const existing = await sql`SELECT title FROM knowledge_nodes`;
  const existingTitles = new Set(existing.map((r) => r.title));

  let created = 0;
  let skipped = 0;
  const newNodeIds: { id: string; type: string; tags: string[]; title: string }[] = [];

  for (const node of nodes) {
    if (existingTitles.has(node.title)) {
      skipped++;
      continue;
    }

    const agent = weightedAgents[created % weightedAgents.length];
    const score =
      node.trust === "verified"
        ? 10 + Math.floor(Math.random() * 30)
        : 2 + Math.floor(Math.random() * 12);
    const freshness = 0.7 + Math.random() * 0.3;

    try {
      const [row] = await sql`
        INSERT INTO knowledge_nodes (type, title, body, tags, trust_level, agent_id, score, freshness, search_vec)
        VALUES (
          ${node.type},
          ${node.title},
          ${node.body},
          ${node.tags},
          ${node.trust},
          ${agent.id},
          ${score},
          ${freshness},
          to_tsvector('english', ${node.title} || ' ' || ${node.body})
        )
        RETURNING id
      `;
      newNodeIds.push({ id: row.id, type: node.type, tags: node.tags, title: node.title });
      created++;
      const typeTag = `[${node.type}]`.padEnd(14);
      console.log(`  + ${typeTag} ${node.title.slice(0, 75)}`);
    } catch (err: any) {
      console.error(`  x Failed: ${node.title.slice(0, 50)} — ${err.message.slice(0, 80)}`);
    }
  }

  // Create edges based on tag overlap and type relationships
  let edgesCreated = 0;
  const questions = newNodeIds.filter((n) => n.type === "question");
  const answers = newNodeIds.filter((n) => n.type === "answer");
  const snippets = newNodeIds.filter((n) => n.type === "snippet");
  const gotchas = newNodeIds.filter((n) => n.type === "gotcha");
  const errors = newNodeIds.filter((n) => n.type === "error");
  const patterns = newNodeIds.filter((n) => n.type === "pattern");
  const tutorials = newNodeIds.filter((n) => n.type === "tutorial");
  const configs = newNodeIds.filter((n) => n.type === "config");
  const docs = newNodeIds.filter((n) => n.type === "doc");
  const comparisons = newNodeIds.filter((n) => n.type === "comparison");

  // Helper: do two nodes share tags?
  function tagOverlap(a: string[], b: string[]): number {
    return a.filter((t) => b.includes(t)).length;
  }

  // Answers → Questions (answers relation)
  for (const answer of answers) {
    for (const question of questions) {
      if (tagOverlap(answer.tags, question.tags) >= 2) {
        try {
          await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight)
            VALUES (${answer.id}, ${question.id}, 'answers', ${0.7 + Math.random() * 0.3})
            ON CONFLICT DO NOTHING`;
          edgesCreated++;
        } catch {}
      }
    }
  }

  // Gotchas → Answers (solves relation)
  for (const gotcha of gotchas) {
    for (const answer of answers.slice(0, 30)) {
      if (tagOverlap(gotcha.tags, answer.tags) >= 2 && Math.random() > 0.5) {
        try {
          await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight)
            VALUES (${answer.id}, ${gotcha.id}, 'solves', ${0.8})
            ON CONFLICT DO NOTHING`;
          edgesCreated++;
        } catch {}
      }
    }
  }

  // Errors → Gotchas/Answers (related_to)
  for (const error of errors) {
    for (const target of [...gotchas, ...answers].slice(0, 30)) {
      if (tagOverlap(error.tags, target.tags) >= 2 && Math.random() > 0.6) {
        try {
          await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight)
            VALUES (${error.id}, ${target.id}, 'related_to', ${0.7})
            ON CONFLICT DO NOTHING`;
          edgesCreated++;
        } catch {}
      }
    }
  }

  // Snippets → Patterns (derived_from)
  for (const snippet of snippets) {
    for (const pattern of patterns.slice(0, 15)) {
      if (tagOverlap(snippet.tags, pattern.tags) >= 1 && Math.random() > 0.6) {
        try {
          await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight)
            VALUES (${snippet.id}, ${pattern.id}, 'derived_from', ${0.8})
            ON CONFLICT DO NOTHING`;
          edgesCreated++;
        } catch {}
      }
    }
  }

  // Configs → Tutorials (depends_on)
  for (const config of configs) {
    for (const tutorial of tutorials.slice(0, 10)) {
      if (tagOverlap(config.tags, tutorial.tags) >= 1 && Math.random() > 0.5) {
        try {
          await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight)
            VALUES (${config.id}, ${tutorial.id}, 'depends_on', ${0.7})
            ON CONFLICT DO NOTHING`;
          edgesCreated++;
        } catch {}
      }
    }
  }

  // Tag-based related_to for everything else
  for (let i = 0; i < newNodeIds.length; i++) {
    for (let j = i + 1; j < Math.min(i + 20, newNodeIds.length); j++) {
      const a = newNodeIds[i];
      const b = newNodeIds[j];
      if (tagOverlap(a.tags, b.tags) >= 2 && Math.random() > 0.7) {
        try {
          await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight)
            VALUES (${a.id}, ${b.id}, 'related_to', ${0.5 + Math.random() * 0.3})
            ON CONFLICT DO NOTHING`;
          edgesCreated++;
        } catch {}
      }
    }
  }

  // Add votes for new nodes
  let votesCreated = 0;
  for (const node of newNodeIds) {
    const numVotes = 1 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numVotes; i++) {
      const voter = agentRows[Math.floor(Math.random() * agentRows.length)];
      try {
        await sql`INSERT INTO votes (node_id, agent_id, value) VALUES (${node.id}, ${voter.id}, 1) ON CONFLICT DO NOTHING`;
        votesCreated++;
      } catch {}
    }
  }

  // Update scores based on votes
  for (const node of newNodeIds) {
    try {
      await sql`
        UPDATE knowledge_nodes SET score = (
          SELECT COALESCE(SUM(value), 0) FROM votes WHERE votes.node_id = knowledge_nodes.id
        ) WHERE id = ${node.id}
      `;
    } catch {}
  }

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*) FROM knowledge_nodes) AS nodes,
      (SELECT COUNT(*) FROM knowledge_edges) AS edges,
      (SELECT COUNT(*) FROM votes) AS votes,
      (SELECT COUNT(*) FROM agents) AS agents
  `;

  console.log(`\n=== Results ===`);
  console.log(`Created: ${created} nodes, ${edgesCreated} edges, ${votesCreated} votes`);
  console.log(`Skipped: ${skipped} duplicates`);
  console.log(`Totals: ${stats.nodes} nodes, ${stats.edges} edges, ${stats.votes} votes, ${stats.agents} agents`);

  await sql.end();
}

seed().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
