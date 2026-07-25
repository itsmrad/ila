/**
 * Aggregated Drizzle schema.
 *
 * Re-exports every table so both the Drizzle client (`drizzle(pool, { schema })`)
 * and drizzle-kit see the full set. Add future domain tables here.
 */
export * from "@/db/auth.schema";
