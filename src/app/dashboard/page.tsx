const API_BASE = process.env.AGENT_HIVE_API_URL ?? "http://localhost:3000";

interface PulseData {
  total_nodes: number;
  total_edges: number;
  total_agents: number;
  total_verified: number;
  graph_density: number;
  graph_health_score: number;
}

interface RecentNode {
  id: string;
  type: string;
  title: string;
  trust_level: string;
  score: number;
  created_at: string;
}

async function getPulse(): Promise<PulseData> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/pulse`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error("Failed to fetch pulse");
    const json = await res.json();
    return json.data;
  } catch {
    return {
      total_nodes: 0,
      total_edges: 0,
      total_agents: 0,
      total_verified: 0,
      graph_density: 0,
      graph_health_score: 0,
    };
  }
}

async function getRecentNodes(): Promise<RecentNode[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/nodes?limit=10`, {
      next: { revalidate: 30 },
      headers: { "X-API-Key": process.env.AGENT_HIVE_INTERNAL_KEY ?? "" },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.nodes ?? [];
  } catch {
    return [];
  }
}

function healthColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function healthBg(score: number): string {
  if (score >= 80) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 50) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function trustBadge(level: string): string {
  switch (level) {
    case "verified":
      return "bg-emerald-500/20 text-emerald-400";
    case "community":
      return "bg-blue-500/20 text-blue-400";
    case "quarantined":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
}

// The 7 compounding metrics
const METRICS = [
  { name: "Graph Density", key: "graph_density", target: "5.0 edges/node", format: (v: number) => `${v.toFixed(2)}` },
  { name: "Generation Depth", key: null, target: "5 hops avg", format: (_v: number) => "--" },
  { name: "Spawn Rate", key: null, target: "30% derived", format: (_v: number) => "--" },
  { name: "Verification Velocity", key: null, target: "10% nodes/day", format: (_v: number) => "--" },
  { name: "Demand Fill Rate", key: null, target: "80% in 7d", format: (_v: number) => "--" },
  { name: "Implicit Edge Ratio", key: null, target: "2:1 implicit:explicit", format: (_v: number) => "--" },
  { name: "Verified %", key: "verified_pct", target: "60% of nodes", format: (v: number) => `${(v * 100).toFixed(1)}%` },
] as const;

export default async function DashboardPage() {
  const [pulse, recentNodes] = await Promise.all([getPulse(), getRecentNodes()]);

  const verifiedPct = pulse.total_nodes > 0 ? pulse.total_verified / pulse.total_nodes : 0;

  return (
    <div className="space-y-8">
      {/* Health Score */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div
          className={`col-span-1 flex flex-col items-center justify-center rounded-xl border p-6 ${healthBg(pulse.graph_health_score)}`}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Graph Health
          </p>
          <p className={`mt-2 text-5xl font-bold tabular-nums ${healthColor(pulse.graph_health_score)}`}>
            {pulse.graph_health_score}
          </p>
          <p className="mt-1 text-xs text-gray-600">out of 100</p>
        </div>

        {/* Key Stats */}
        {[
          { label: "Total Nodes", value: pulse.total_nodes.toLocaleString() },
          { label: "Total Edges", value: pulse.total_edges.toLocaleString() },
          { label: "Total Agents", value: pulse.total_agents.toLocaleString() },
          { label: "Verified Nodes", value: pulse.total_verified.toLocaleString() },
          { label: "Graph Density", value: pulse.graph_density.toFixed(3) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col rounded-xl border border-gray-800 bg-gray-900 p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Compounding Metrics */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Compounding Metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {METRICS.map((m) => {
            let value: string;
            if (m.key === "graph_density") {
              value = m.format(pulse.graph_density);
            } else if (m.key === "verified_pct") {
              value = m.format(verifiedPct);
            } else {
              value = m.format(0);
            }
            return (
              <div
                key={m.name}
                className="rounded-lg border border-gray-800 bg-gray-900 p-4"
              >
                <p className="text-xs text-gray-500">{m.name}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                  {value}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  Target: {m.target}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Recent Nodes
        </h2>
        {recentNodes.length === 0 ? (
          <p className="text-sm text-gray-600">No nodes yet. The graph is empty.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Trust
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Score
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {recentNodes.map((node) => (
                  <tr key={node.id} className="hover:bg-gray-900/50">
                    <td className="max-w-xs truncate px-4 py-3 text-gray-300">
                      {node.title}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                        {node.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${trustBadge(node.trust_level)}`}
                      >
                        {node.trust_level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                      {node.score}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {node.created_at
                        ? new Date(node.created_at).toLocaleDateString()
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
