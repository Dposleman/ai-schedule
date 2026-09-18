import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { badRequest, withRoute } from "@/lib/api";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

export const POST = withRoute(async (request: NextRequest) => {
  await ensureSchema();
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  const password = body?.password;
  if (!email || !password) return badRequest("Enter your email and password.");

  // Limit by IP+email together: generous enough for a real person mistyping
  // their password a few times, tight enough to stop a brute-force script.
  if (isRateLimited(`login:${clientIp(request)}:${email}`, 10, 5 * 60 * 1000)) {
    return badRequest("Too many attempts — please wait a few minutes and try again.");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return badRequest("Incorrect email or password.");
  }

  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true });
});
