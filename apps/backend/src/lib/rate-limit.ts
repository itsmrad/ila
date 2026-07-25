import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiRateLimit } from "@/db/chat.schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** 429 with a `Retry-After` hint. */
export class TooManyRequestsError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "Too many requests") {
    super(429, "RATE_LIMITED", message, {
      details: { retryAfterSeconds },
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
  resetAt: Date;
}

export interface RateLimitOptions {
  /** Logical bucket, e.g. `"chat"`. */
  bucket: string;
  /** Subject the limit applies to — always a server-derived user id. */
  subject: string;
  /** Requests permitted per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Per-process fallback counters, used only while the database is unreachable.
 *
 * Failing closed would lock every user out on a transient DB blip; failing
 * fully open would remove the only spend guard on the AI endpoint. This keeps a
 * limit in force (per instance rather than per cluster) until Postgres recovers.
 */
const memoryWindows = new Map<string, { count: number; windowStart: number }>();

function consumeInMemory(
  key: string,
  windowMs: number,
  now: number,
): { count: number; windowStart: number } {
  // Opportunistic sweep so the map cannot grow without bound.
  if (memoryWindows.size > 10_000) {
    for (const [candidate, window] of memoryWindows) {
      if (window.windowStart <= now - windowMs) memoryWindows.delete(candidate);
    }
  }

  const existing = memoryWindows.get(key);
  if (!existing || existing.windowStart <= now - windowMs) {
    const fresh = { count: 1, windowStart: now };
    memoryWindows.set(key, fresh);
    return fresh;
  }
  existing.count += 1;
  return existing;
}

/**
 * Postgres-backed fixed-window rate limiter.
 *
 * The increment and the window roll happen inside a single atomic
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so concurrent requests — even
 * across backend instances — cannot both observe a stale count. There is no
 * read-then-write race to exploit.
 */
export async function consumeRateLimit(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const { bucket, subject, max, windowSeconds } = options;
  const key = `${bucket}:${subject}`;
  const windowMs = windowSeconds * 1_000;
  const now = Date.now();
  const windowFloor = now - windowMs;

  let count = 1;
  let windowStart = now;

  try {
    const [row] = await db
      .insert(apiRateLimit)
      .values({ key, count: 1, windowStart: now })
      .onConflictDoUpdate({
        target: apiRateLimit.key,
        set: {
          count: sql`case when ${apiRateLimit.windowStart} <= ${windowFloor} then 1 else ${apiRateLimit.count} + 1 end`,
          windowStart: sql`case when ${apiRateLimit.windowStart} <= ${windowFloor} then ${now}::bigint else ${apiRateLimit.windowStart} end`,
        },
      })
      .returning({
        count: apiRateLimit.count,
        windowStart: apiRateLimit.windowStart,
      });

    if (row) {
      count = row.count;
      windowStart = Number(row.windowStart);
    }
    // The database is authoritative again; drop the degraded-mode counter.
    memoryWindows.delete(key);
  } catch (error) {
    logger.error(
      { err: error, bucket },
      "Rate limit store unavailable — falling back to in-process counters",
    );
    const fallback = consumeInMemory(key, windowMs, now);
    count = fallback.count;
    windowStart = fallback.windowStart;
  }

  const resetAtMs = windowStart + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - now) / 1_000));

  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    limit: max,
    retryAfterSeconds,
    resetAt: new Date(resetAtMs),
  };
}

/** Consume a slot or throw {@link TooManyRequestsError}. */
export async function enforceRateLimit(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const result = await consumeRateLimit(options);
  if (!result.allowed) {
    throw new TooManyRequestsError(
      result.retryAfterSeconds,
      `Rate limit exceeded. Try again in ${result.retryAfterSeconds}s.`,
    );
  }
  return result;
}
