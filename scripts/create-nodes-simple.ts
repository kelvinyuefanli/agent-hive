/**
 * Create real knowledge nodes directly in the database.
 * Usage: DATABASE_URL=... npx tsx scripts/create-nodes-simple.ts
 */
import postgres from "postgres";
import { readFileSync } from "fs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
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

const nodes: Node[] = JSON.parse(readFileSync("scripts/nodes-data.json", "utf8"));

async function createNodes() {
  console.log("Creating knowledge nodes...\n");

  const agentRows = await sql`SELECT id, name FROM agents ORDER BY reputation DESC`;
  if (agentRows.length === 0) {
    console.error("No agents found. Run seed.ts first.");
    process.exit(1);
  }

  let created = 0;
  for (const node of nodes) {
    const agent = agentRows[created % agentRows.length];
    const score = node.trust === "verified" ? 15 + Math.floor(Math.random() * 25) : Math.floor(Math.random() * 15);
    const freshness = 0.75 + Math.random() * 0.25;

    try {
      await sql`
        INSERT INTO knowledge_nodes (type, title, body, tags, trust_level, agent_id, score, freshness)
        VALUES (${node.type}, ${node.title}, ${node.body}, ${node.tags}, ${node.trust}, ${agent.id}, ${score}, ${freshness})
      `;
      created++;
      console.log("  ✓ [" + node.type + "] " + node.title.slice(0, 70));
    } catch (err: any) {
      console.error("  ✗ Failed: " + node.title.slice(0, 40) + " — " + err.message);
    }
  }

  // Create edges between nodes
  const allNodes = await sql`SELECT id, type, title FROM knowledge_nodes ORDER BY created_at DESC LIMIT 50`;
  const questions = allNodes.filter(n => n.type === "question");
  const answers = allNodes.filter(n => n.type === "answer");
  const docs = allNodes.filter(n => n.type === "doc");
  const snippets = allNodes.filter(n => n.type === "snippet");
  const gotchas = allNodes.filter(n => n.type === "gotcha");

  let edgesCreated = 0;
  for (const answer of answers.slice(0, 6)) {
    for (const question of questions.slice(0, 4)) {
      if (Math.random() > 0.6) {
        try {
          await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight) VALUES (${answer.id}, ${question.id}, 'answers', ${0.7 + Math.random() * 0.3}) ON CONFLICT DO NOTHING`;
          edgesCreated++;
        } catch {}
      }
    }
  }
  for (const snippet of snippets.slice(0, 5)) {
    const answer = answers[Math.floor(Math.random() * answers.length)];
    if (answer) {
      try {
        await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight) VALUES (${snippet.id}, ${answer.id}, 'derived_from', ${0.8}) ON CONFLICT DO NOTHING`;
        edgesCreated++;
      } catch {}
    }
  }
  for (const gotcha of gotchas) {
    const doc = docs[Math.floor(Math.random() * docs.length)];
    if (doc) {
      try {
        await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight) VALUES (${gotcha.id}, ${doc.id}, 'related_to', ${0.7}) ON CONFLICT DO NOTHING`;
        edgesCreated++;
      } catch {}
    }
  }
  for (let i = 0; i < docs.length - 1; i++) {
    try {
      await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight) VALUES (${docs[i].id}, ${docs[i + 1].id}, 'related_to', ${0.5}) ON CONFLICT DO NOTHING`;
      edgesCreated++;
    } catch {}
  }
  // Cross-link some answers
  for (let i = 0; i < answers.length - 1; i += 2) {
    try {
      await sql`INSERT INTO knowledge_edges (source_id, target_id, relation, weight) VALUES (${answers[i].id}, ${answers[i + 1].id}, 'related_to', ${0.6}) ON CONFLICT DO NOTHING`;
      edgesCreated++;
    } catch {}
  }

  // Add votes
  let votesCreated = 0;
  const recentNodes = await sql`SELECT id FROM knowledge_nodes ORDER BY created_at DESC LIMIT 40`;
  for (const node of recentNodes) {
    const numVotes = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numVotes; i++) {
      const voter = agentRows[Math.floor(Math.random() * agentRows.length)];
      try {
        await sql`INSERT INTO votes (node_id, agent_id, value) VALUES (${node.id}, ${voter.id}, 1) ON CONFLICT DO NOTHING`;
        votesCreated++;
      } catch {}
    }
  }

  // Add proofs for verified nodes
  let proofsCreated = 0;
  const verifiedNodes = await sql`SELECT id FROM knowledge_nodes WHERE trust_level = 'verified' ORDER BY created_at DESC LIMIT 20`;
  for (const node of verifiedNodes) {
    const numProofs = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < numProofs; i++) {
      const prover = agentRows[Math.floor(Math.random() * agentRows.length)];
      try {
        await sql`INSERT INTO execution_proofs (node_id, agent_id, env_info, exit_code, success) VALUES (${node.id}, ${prover.id}, ${JSON.stringify({ runtime: "node", version: "22.5.0", os: "linux-x64" })}, 0, true)`;
        proofsCreated++;
      } catch {}
    }
  }

  // Add more search signals for wanted nodes
  let signalsCreated = 0;
  const wantedNodes = await sql`SELECT id, title FROM knowledge_nodes WHERE type = 'wanted'`;
  for (const node of wantedNodes) {
    const numSignals = 3 + Math.floor(Math.random() * 7);
    for (let i = 0; i < numSignals; i++) {
      const searcher = agentRows[Math.floor(Math.random() * agentRows.length)];
      try {
        await sql`INSERT INTO search_signals (query_normalized, agent_id, results_count) VALUES (${node.title.toLowerCase().trim()}, ${searcher.name}, 0)`;
        signalsCreated++;
      } catch {}
    }
  }

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*) FROM knowledge_nodes) AS nodes,
      (SELECT COUNT(*) FROM knowledge_edges) AS edges,
      (SELECT COUNT(*) FROM votes) AS votes,
      (SELECT COUNT(*) FROM execution_proofs) AS proofs,
      (SELECT COUNT(*) FROM search_signals) AS signals,
      (SELECT COUNT(*) FROM agents) AS agents
  `;

  console.log("\n=== Done ===");
  console.log("Created: " + created + " nodes, " + edgesCreated + " edges, " + votesCreated + " votes, " + proofsCreated + " proofs, " + signalsCreated + " signals");
  console.log("Totals:", stats);

  await sql.end();
}

createNodes().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
