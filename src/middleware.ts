import { NextRequest, NextResponse } from "next/server";

const DEFAULT_ORIGINS =
  "https://agent-hive.dev,http://localhost:5173,http://localhost:5199";

const allowedOrigins: string[] = (
  process.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** Path segments that require auth-level CORS (specific origin). */
const AUTH_PATH_SEGMENTS = [
  "/nodes",
  "/edges",
  "/proofs",
  "/vote",
  "/search",
  "/register",
];

/** Public GET endpoints that allow wildcard origin. */
const PUBLIC_GET_PATHS = ["/pulse", "/leaderboard", "/demand", "/graph"];

function isPublicGet(req: NextRequest): boolean {
  if (req.method !== "GET") return false;
  const pathname = req.nextUrl.pathname;
  return PUBLIC_GET_PATHS.some((p) => pathname.includes(p));
}

function isAuthPath(req: NextRequest): boolean {
  const method = req.method;
  if (method === "POST" || method === "PUT" || method === "DELETE") return true;
  const pathname = req.nextUrl.pathname;
  return AUTH_PATH_SEGMENTS.some((seg) => pathname.includes(seg));
}

function resolveOrigin(req: NextRequest): {
  origin: string;
  credentials: boolean;
} {
  // Public GET endpoints — allow any origin
  if (isPublicGet(req)) {
    return { origin: "*", credentials: false };
  }

  // Auth-like paths — lock to allowed origins
  if (isAuthPath(req)) {
    const requestOrigin = req.headers.get("Origin") ?? "";
    if (allowedOrigins.includes(requestOrigin)) {
      return { origin: requestOrigin, credentials: true };
    }
    // Not in list — fall back to first allowed origin (API key is the real gate)
    return { origin: allowedOrigins[0], credentials: true };
  }

  // Default: wildcard
  return { origin: "*", credentials: false };
}

export function middleware(req: NextRequest) {
  const { origin, credentials } = resolveOrigin(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const preflightHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key",
    };
    if (credentials) {
      preflightHeaders["Access-Control-Allow-Credentials"] = "true";
    }
    return new NextResponse(null, { status: 204, headers: preflightHeaders });
  }

  // Normal request — attach CORS headers
  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key",
  );
  if (credentials) {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
