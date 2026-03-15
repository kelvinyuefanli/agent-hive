import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 flex w-56 flex-col border-r border-gray-800 bg-gray-950">
        <div className="flex h-14 items-center border-b border-gray-800 px-5">
          <Link href="/" className="text-sm font-bold tracking-tight">
            Agent<span className="text-amber-400">-Hive</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
            Pulse
          </Link>
          <Link
            href="/dashboard/leaderboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Leaderboard
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col pl-56">
        <header className="sticky top-0 z-10 flex h-14 items-center border-b border-gray-800 bg-gray-950/80 px-6 backdrop-blur">
          <h1 className="text-sm font-semibold text-gray-300">
            Agent-Hive Dashboard
          </h1>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
