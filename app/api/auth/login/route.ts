import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { badRequest, withRoute } from "@/lib/api";
import { parseBody, zEmail } from "@/lib/validation";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: zEmail,
  // Not validated for shape/length here (unlike signup) — a login attempt
  // has to reach verifyPassword() and fail there no matter what was typed,
  // so the error message doesn't leak which part of the login was wrong.
  password: z.string().min(1, "Enter your email and password."),
});

export const POST = withRoute(async (request: NextRequest) => {
  await ensureSchema();
  const { data, error } = await parseBody(request, loginSchema);
  if (error) return badRequest("Enter your email and password.");
  const { email, password } = data;

  // Limit by IP+email together: generous enough for a real person mistyping
  // their password a few times, tight enough to stop a brute-force script.
  if (await isRateLimited(`login:${clientIp(request)}:${email}`, 10, 5 * 60 * 1000)) {
    return badRequest("Too many attempts — please wait a few minutes and try again.");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return badRequest("Incorrect email or password.");
  }

  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true });
});
