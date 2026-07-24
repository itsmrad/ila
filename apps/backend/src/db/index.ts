import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { env, isProduction } from "@/config/env";
import { logger } from "@/lib/logger";
import * as schema from "@/db/schema";

/**
 * Shared Postgres connection pool.
 *
 * A single pool is created per process and reused across the app. The pool is
 * lazy — connections are opened on first query — so importing this module does
 * not require the database to be reachable.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: isProduction ? 20 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle Postgres client");
});

export const db = drizzle(pool, { schema, logger: false });

export type Database = typeof db;

/** Lightweight connectivity + latency probe used by the health route. */
export async function checkDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

/** Gracefully drain the pool on shutdown. */
export async function closeDatabase(): Promise<void> {
  await pool.end();
}
