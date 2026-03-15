import http from "node:http";
import { runEnricherCycle } from "@/lib/growth/enricher";

const INTERVAL_MS = 60_000; // 60 seconds
const HEALTHCHECK_PORT = 8080;

let lastRun: string | null = null;
const startedAt = Date.now();

// ─── Healthcheck HTTP server ───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        last_run: lastRun,
        uptime_s: Math.floor((Date.now() - startedAt) / 1000),
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(HEALTHCHECK_PORT, () => {
  console.log(`[enricher-worker] Healthcheck listening on :${HEALTHCHECK_PORT}/healthz`);
});

// ─── Enricher loop ─────────────────────────────────────────────────────────
async function main() {
  console.log("[enricher-worker] Starting Agent-Hive Graph Enricher");
  console.log(`[enricher-worker] Running every ${INTERVAL_MS / 1000}s`);

  // Run immediately on startup
  await runEnricherCycle();
  lastRun = new Date().toISOString();

  // Then run on interval
  setInterval(async () => {
    try {
      await runEnricherCycle();
      lastRun = new Date().toISOString();
    } catch (error) {
      console.error(
        "[enricher-worker] Unhandled error in enricher cycle:",
        error,
      );
    }
  }, INTERVAL_MS);
}

main().catch((error) => {
  console.error("[enricher-worker] Fatal error:", error);
  process.exit(1);
});
