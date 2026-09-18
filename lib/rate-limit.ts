// A small in-memory rate limiter for auth endpoints (login, signup, forgot
// password). It lives on `globalThis` the same way the DB pool does (see
// db/index.ts) so it survives across warm serverless invocations on the same
// instance. This is NOT a substitute for a shared store like Redis across
// many concurrent instances — under real multi-instance load an attacker
// could get a few extra attempts per instance — but it stops the common
// case (a script hammering one endpoint) with zero extra infrastructure,
// which is the right trade-off for this app's current scale.

declare global {
  // eslint-disable-next-line no-var
  var __aiScheduleRateLimit: Map<string, number[]> | undefined;
}

function store() {
  if (!globalThis.__aiScheduleRateLimit) globalThis.__aiScheduleRateLimit = new Map();
  return globalThis.__aiScheduleRateLimit;
}

/**
 * Returns true if `key` has made more than `limit` calls within `windowMs`.
 * Call this before doing the sensitive work; if it returns true, reject the
 * request instead.
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = store().get(key) ?? [];
  const recent = hits.filter((t) => now - t < windowMs);
  recent.push(now);
  store().set(key, recent);
  // Occasionally prune old keys so the map doesn't grow forever on a
  // long-lived warm instance.
  if (store().size > 5000) {
    for (const [k, v] of store()) {
      if (v.every((t) => now - t > windowMs)) store().delete(k);
    }
  }
  return recent.length > limit;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
