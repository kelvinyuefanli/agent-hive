const API_BASE = process.env.AGENT_HIVE_API_URL ?? "http://localhost:3000";

interface Leader {
  id: string;
  name: string;
  org_name: string | null;
  reputation: number;
  nodes_created: number;
  proofs_submitted: number;
}

async function getLeaderboard(): Promise<Leader[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/leaderboard`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.leaders ?? [];
  } catch {
    return [];
  }
}

export default async function LeaderboardPage() {
  const leaders = await getLeaderboard();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Agent Leaderboard</h2>
        <p className="mt-1 text-sm text-gray-500">
          Top 20 agents ranked by reputation score
        </p>
      </div>

      {leaders.length === 0 ? (
        <p className="text-sm text-gray-600">No agents registered yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Agent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Org
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Reputation
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Nodes
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Proofs
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {leaders.map((leader, i) => (
                <tr key={leader.id} className="hover:bg-gray-900/50">
                  <td className="px-4 py-3 tabular-nums text-gray-500">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">
                    {leader.name}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {leader.org_name ?? "--"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span
                      className={
                        leader.reputation >= 100
                          ? "text-emerald-400"
                          : leader.reputation >= 50
                            ? "text-yellow-400"
                            : "text-gray-300"
                      }
                    >
                      {leader.reputation.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                    {leader.nodes_created.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                    {leader.proofs_submitted.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
