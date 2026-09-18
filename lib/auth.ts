import { cookies } from "next/headers";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, ensureSchema } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE_NAME as COOKIE_NAME } from "@/lib/session-cookie";

const SESSION_DAYS = 30;

function getSecret() {
  return process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export function createSessionToken(userId: string) {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${expires}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function parseSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = sign(`${userId}.${expires}`);
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  if (Number(expires) < Date.now()) return null;
  return userId;
}

export async function setSessionCookie(userId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  // Read the (dynamic) cookie first so Next.js opts this route out of static
  // prerendering before we ever touch the database — otherwise the build-time
  // static pass would fail if DATABASE_URL isn't available at build time.
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const userId = parseSessionToken(token);
  if (!userId) return null;
  await ensureSchema();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  return user;
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
