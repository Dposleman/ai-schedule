// Rate limiting for auth endpoints (login, signup, forgot password, reset
// password). Backed by Upstash Redis when UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN are set, so the limit is shared and accurate
// across every concurrent serverless instance. Without those env vars
// (local dev, or a preview deploy that hasn't been wired up yet) this falls
// back to the old in-memory counter on `globalThis` — per-instance only,
// but zero extra infrastructure required to run the app at all.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

declare global {
  // eslint-disable-next-line no-var
  var __aiScheduleRateLimit: Map<string, number[]> | undefined;
  // eslint-disable-next-line no-var
  var __aiScheduleRatelimiters: Map<string, Ratelimit> | undefined;
  // eslint-disable-next-line no-var
  var __aiScheduleRedis: Redis | null | undefined;
}

function redis(): Redis | null {
  if (globalThis.__aiScheduleRedis !== undefined) return globalThis.__aiScheduleRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  globalThis.__aiScheduleRedis = url && token ? new Redis({ url, token }) : null;
  return globalThis.__aiScheduleRedis;
}

// One Ratelimit instance per distinct (limit, windowMs) pair, reused across
// requests/instances the same way the Redis client is — the Upstash SDK
// docs recommend treating both as long-lived singletons.
function ratelimiter(limit: number, windowMs: number): Ratelimit | null {
  const client = redis();
  if (!client) return null;
  if (!globalThis.__aiScheduleRatelimiters) globalThis.__aiScheduleRatelimiters = new Map();
  const cacheKey = `${limit}:${windowMs}`;
  const cached = globalThis.__aiScheduleRatelimiters.get(cacheKey);
  if (cached) return cached;
  const created = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
    prefix: "ai-schedule:ratelimit",
  });
  globalThis.__aiScheduleRatelimiters.set(cacheKey, created);
  return created;
}

function memoryStore() {
  if (!globalThis.__aiScheduleRateLimit) globalThis.__aiScheduleRateLimit = new Map();
  return globalThis.__aiScheduleRateLimit;
}

function isRateLimitedInMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = memoryStore().get(key) ?? [];
  const recent = hits.filter((t) => now - t < windowMs);
  recent.push(now);
  memoryStore().set(key, recent);
  // Occasionally prune old keys so the map doesn't grow forever on a
  // long-lived warm instance.
  if (memoryStore().size > 5000) {
    for (const [k, v] of memoryStore()) {
      if (v.every((t) => now - t > windowMs)) memoryStore().delete(k);
    }
  }
  return recent.length > limit;
}

/**
 * Returns true if `key` has made more than `limit` calls within `windowMs`.
 * Call this before doing the sensitive work; if it returns true, reject the
 * request instead. Shared across all instances via Upstash Redis when
 * configured; otherwise falls back to a best-effort in-memory count.
 */
export async function isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
  const limiter = ratelimiter(limit, windowMs);
  if (!limiter) return isRateLimitedInMemory(key, limit, windowMs);
  try {
    const { success } = await limiter.limit(key);
    return !success;
  } catch (err) {
    // Upstash unreachable/misconfigured: fail open on the shared limiter and
    // fall back to the in-memory counter rather than locking everyone out of
    // auth because Redis had a bad moment.
    console.error("[rate-limit] Upstash request failed, falling back to in-memory:", err);
    return isRateLimitedInMemory(key, limit, windowMs);
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
