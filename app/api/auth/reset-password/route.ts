import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hashPassword, hashResetToken, setSessionCookie, revokeAllSessions } from "@/lib/auth";
import { badRequest, withRoute } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(500),
  password: z.string().min(8, "Enter a new password of at least 8 characters.").max(200),
});

export const POST = withRoute(async (request: NextRequest) => {
  await ensureSchema();
  const { data, error } = await parseBody(request, resetPasswordSchema);
  if (error) return badRequest("Enter a new password of at least 8 characters.");
  const { token, password } = data;

  if (isRateLimited(`reset:${clientIp(request)}`, 15, 15 * 60 * 1000)) {
    return badRequest("Too many attempts — please wait a few minutes and try again.");
  }

  const tokenHash = hashResetToken(token);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date().toISOString())
      )
    )
    .limit(1);

  if (!row) return badRequest("This reset link is invalid or has expired — request a new one.");

  await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, row.userId));
  await db.update(passwordResetTokens).set({ usedAt: new Date().toISOString() }).where(eq(passwordResetTokens.id, row.id));

  // Whoever had this password no longer should — sign every existing
  // session out (a stolen session on another device, an old logged-in
  // browser) before starting a fresh one for whoever just proved they
  // control the account's email.
  await revokeAllSessions(row.userId);
  await setSessionCookie(row.userId);
  return NextResponse.json({ ok: true });
});
