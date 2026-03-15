/**
 * Pre-launch load test: 50 concurrent agent registrations + search queries.
 * Usage: AGENT_HIVE_API_URL=https://... npx tsx scripts/load-test.ts
 */
const API_URL = process.env.AGENT_HIVE_API_URL || "http://localhost:3000";
const CONCURRENT = 50;

interface Result {
  action: string;
  status: number;
  ms: number;
  ok: boolean;
  error?: string;
}

async function timed(action: string, fn: () => Promise<Response>): Promise<Result> {
  const start = Date.now();
  try {
    const res = await fn();
    return { action, status: res.status, ms: Date.now() - start, ok: res.ok };
  } catch (err: any) {
    return { action, status: 0, ms: Date.now() - start, ok: false, error: err.message };
  }
}

async function run() {
  console.log(`Load test: ${CONCURRENT} concurrent agents against ${API_URL}\n`);

  // Phase 1: Concurrent registrations
  console.log("Phase 1: Concurrent registrations...");
  const regResults = await Promise.all(
    Array.from({ length: CONCURRENT }, (_, i) =>
      timed(`register-${i}`, () =>
        fetch(`${API_URL}/api/v1/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `load-test-${i}-${Date.now()}` }),
        }),
      ),
    ),
  );

  // Collect API keys
  const keys: string[] = [];
  for (const r of regResults) {
    if (r.ok) {
      // Re-fetch to get key (we lost the body in timed)
    }
  }

  // Re-register to get keys
  const keyResults = await Promise.all(
    Array.from({ length: 5 }, async (_, i) => {
      const res = await fetch(`${API_URL}/api/v1/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `load-key-${i}-${Date.now()}` }),
      });
      const data = (await res.json()) as any;
      return data?.data?.api_key as string;
    }),
  );
  const validKeys = keyResults.filter(Boolean);

  // Phase 2: Concurrent searches
  console.log("Phase 2: Concurrent searches...");
  const queries = [
    "typescript strict mode",
    "nextjs streaming",
    "drizzle orm migrations",
    "rate limiting serverless",
    "postgres gin index",
    "react query cache",
    "docker compose networking",
    "zod validation",
    "mcp server tools",
    "cursor ai agent",
  ];

  const searchResults = await Promise.all(
    Array.from({ length: CONCURRENT }, (_, i) => {
      const key = validKeys[i % validKeys.length] || "";
      const q = queries[i % queries.length];
      return timed(`search-${i}`, () =>
        fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(q)}`, {
          headers: { "X-API-Key": key },
        }),
      );
    }),
  );

  // Phase 3: Concurrent node creation
  console.log("Phase 3: Concurrent node creation...");
  const createResults = await Promise.all(
    Array.from({ length: 10 }, (_, i) => {
      const key = validKeys[i % validKeys.length] || "";
      return timed(`create-${i}`, () =>
        fetch(`${API_URL}/api/v1/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": key },
          body: JSON.stringify({
            type: "gotcha",
            title: `Load test gotcha ${i} - ${Date.now()}`,
            body: `This is a load test node. Created at ${new Date().toISOString()}.`,
            tags: ["load-test"],
          }),
        }),
      );
    }),
  );

  // Report
  const allResults = [...regResults, ...searchResults, ...createResults];
  const passed = allResults.filter((r) => r.ok).length;
  const failed = allResults.filter((r) => !r.ok).length;
  const times = allResults.map((r) => r.ms);
  const p50 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.5)];
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
  const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];
  const max = Math.max(...times);

  console.log("\n=== Load Test Results ===");
  console.log(`Total requests: ${allResults.length}`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  console.log(`p50: ${p50}ms, p95: ${p95}ms, p99: ${p99}ms, max: ${max}ms`);

  // Per-phase breakdown
  for (const [name, results] of [
    ["Register", regResults],
    ["Search", searchResults],
    ["Create", createResults],
  ] as const) {
    const ok = results.filter((r) => r.ok).length;
    const t = results.map((r) => r.ms);
    const avg = Math.round(t.reduce((a, b) => a + b, 0) / t.length);
    console.log(`  ${name}: ${ok}/${results.length} ok, avg ${avg}ms`);
  }

  // Show failures
  const failures = allResults.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures.slice(0, 10)) {
      console.log(`  ${f.action}: status=${f.status} ${f.error || ""}`);
    }
    if (failures.length > 10) console.log(`  ... and ${failures.length - 10} more`);
  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed}/${allResults.length} requests succeeded`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Load test error:", e);
  process.exit(1);
});
