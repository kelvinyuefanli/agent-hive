import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Railway injects DATABASE_URL with internal hostname that may not resolve.
// DATABASE_PUBLIC_URL uses the public proxy and always works.
const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

// Lazy initialization — only connect when actually used at runtime
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Default export for convenience — will throw at runtime if no DATABASE_URL
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});
