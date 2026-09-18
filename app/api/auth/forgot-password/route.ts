import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, ensureSchema } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashResetToken, newId } from "@/lib/auth";
import { badRequest, withRoute } from "@/lib/api";
import { isRateLimited, clientIp } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export const POST = withRoute(async (request: NextRequest) => {
  await ensureSchema();
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  if (!email) return badRequest("Enter your email.");

  if (isRateLimited(`forgot:${clientIp(request)}:${email}`, 5, 15 * 60 * 1000)) {
    return badRequest("Too many attempts — please wait a few minutes and try again.");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Always respond the same way whether or not the account exists, so this
  // endpoint can't be used to check which emails have accounts.
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(passwordResetTokens).values({
      id: newId("prt"),
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    });
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
  }

  return NextResponse.json({ ok: true });
});
