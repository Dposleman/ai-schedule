import { cookies, headers } from "next/headers";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, ensureSchema } from "@/db";
import { users, sessions } from "@/db/schema";
import { and, eq, isNull, gt, lt, or } from "drizzle-orm";
import { SESSION_COOKIE_NAME as COOKIE_NAME } from "@/lib/session-cookie";

const SESSION_DAYS = 30;

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

// Session tokens are high-entropy random values, never derived from or
// signed over the user id — the cookie proves nothing by itself. What makes
// a session valid is a matching, non-revoked, non-expired row in `sessions`
// (see db/schema.ts), which is what makes it possible to actually sign a
// session out from the server: delete or revoke that row and the cookie
// becomes worthless immediately, on every device that held it, instead of
// staying valid until its 30-day expiry no matter what.
function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function requestMeta() {
  try {
    const store = await headers();
    return {
      userAgent: (store.get("user-agent") ?? "").slice(0, 300),
      ipAddress: (store.get("x-forwarded-for")?.split(",")[0]?.trim() || store.get("x-real-ip") || "").slice(0, 100),
    };
  } catch {
    // headers() is only available inside a request context; callers outside
    // one (none currently, but defensively) just get an unlabeled session.
    return { userAgent: "", ipAddress: "" };
  }
}

/**
 * Occasionally sweep out sessions nobody can use anymore (expired, or
 * revoked more than a day ago) so the table doesn't grow forever. Cheap and
 * approximate on purpose — same trade-off as the in-memory rate limiter's
 * own pruning (see lib/rate-limit.ts) — a fixed schedule would need a cron
 * entry for what's a housekeeping detail, not a correctness requirement.
 */
async function maybePruneSessions() {
  if (Math.random() > 0.01) return;
  const now = new Date().toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db.delete(sessions).where(or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, oneDayAgo)));
}

export async function setSessionCookie(userId: string) {
  await ensureSchema();
  const token = generateToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const meta = await requestMeta();

  await db.insert(sessions).values({
    id: newId("sess"),
    userId,
    tokenHash: hashToken(token),
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    expiresAt: expires.toISOString(),
  });
  await maybePruneSessions();

  const store = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    // The mobile app (Capacitor) calls this API from a different origin than
    // the one it's served from, so the cookie needs SameSite=None to be sent
    // on those cross-origin requests — which in turn requires Secure. Locally
    // (http, same-origin) we fall back to Lax so dev keeps working without https.
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Revokes the current session (the one in this request's cookie) and clears it. */
export async function clearSessionCookie() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await ensureSchema();
    await db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(COOKIE_NAME);
}

/**
 * Revokes every session for a user — every device, everywhere — regardless
 * of which one is currently making the request. Used wherever a stolen
 * session should stop mattering: changing your password should not leave an
 * attacker's earlier session (or a session on a lost device) still valid.
 */
export async function revokeAllSessions(userId: string) {
  await ensureSchema();
  await db
    .update(sessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function getCurrentUser() {
  // Read the (dynamic) cookie first so Next.js opts this route out of static
  // prerendering before we ever touch the database — otherwise the build-time
  // static pass would fail if DATABASE_URL isn't available at build time.
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  await ensureSchema();

  const now = new Date().toISOString();
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;
  return user;
}

// Password-reset tokens are high-entropy random values, not user-chosen
// passwords, so a fast, unsalted hash is the standard (and sufficient)
// choice here — unlike hashPassword() above, which deliberately uses a slow,
// salted algorithm to resist guessing a low-entropy human password.
export function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
