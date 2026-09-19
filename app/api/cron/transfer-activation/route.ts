import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { transfers, users } from "@/db/schema";
import { and, eq, isNull, lte } from "drizzle-orm";
import { withRoute } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit";

// Same authorization pattern as coverage-escalation: in production, a
// missing CRON_SECRET fails closed; only local dev (no secret, not on
// Vercel) skips the check.
function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !process.env.VERCEL;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Runs a few times a day (see .github/workflows/transfer-activation.yml) and
// applies any transfer whose startDate has arrived but whose
// currentLocationId change hasn't been applied yet — the case where a
// manager scheduled a future-dated transfer (see app/api/transfers/route.ts,
// which only applies the move immediately for a same-day/past startDate).
export const GET = withRoute(async (request: NextRequest) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const today = new Date().toISOString().slice(0, 10);
  const pending = await db
    .select()
    .from(transfers)
    .where(and(eq(transfers.status, "active"), isNull(transfers.activatedAt), lte(transfers.startDate, today)));

  for (const transfer of pending) {
    const [target] = await db.select().from(users).where(eq(users.id, transfer.userId)).limit(1);
    if (!target) continue;

    await db
      .update(users)
      .set({
        currentLocationId: transfer.toLocationId,
        homeLocationId: transfer.type === "permanent" ? transfer.toLocationId : target.homeLocationId,
      })
      .where(eq(users.id, transfer.userId));

    await db.update(transfers).set({ activatedAt: new Date().toISOString() }).where(eq(transfers.id, transfer.id));

    await recordAuditEvent(transfer.orgId, { id: null, name: "Scheduled transfer" }, "transfer.activate", "transfer", transfer.id, {
      userId: transfer.userId,
      toLocationId: transfer.toLocationId,
      type: transfer.type,
    });
  }

  return NextResponse.json({ ok: true, activated: pending.length });
});
