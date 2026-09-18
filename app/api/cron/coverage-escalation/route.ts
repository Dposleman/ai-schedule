import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { coverageRequests, coverageCandidates, shifts, users, locations } from "@/db/schema";
import { and, eq, inArray, lt } from "drizzle-orm";
import { notifyMany, managersOf } from "@/lib/notifications";

const ESCALATE_AFTER_MS = 60 * 60 * 1000; // 1 hour, per the "call them yourself" policy

// Runs on a schedule (see vercel.json) — not tied to any one user's
// session, so it can't reuse requireUser(). Vercel signs cron requests with
// this header; when CRON_SECRET isn't set (e.g. running locally) the check
// is skipped so local testing still works.
function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const cutoff = new Date(Date.now() - ESCALATE_AFTER_MS).toISOString();
  const stale = await db
    .select()
    .from(coverageRequests)
    .where(and(eq(coverageRequests.status, "open"), eq(coverageRequests.escalated, 0), lt(coverageRequests.createdAt, cutoff)));

  if (stale.length === 0) {
    return NextResponse.json({ ok: true, escalated: 0 });
  }

  await db
    .update(coverageRequests)
    .set({ escalated: 1 })
    .where(inArray(coverageRequests.id, stale.map((row) => row.id)));

  for (const request_ of stale) {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, request_.shiftId)).limit(1);
    if (!shift) continue;
    const [site] = await db.select().from(locations).where(eq(locations.id, shift.locationId)).limit(1);

    const candidateRows = await db
      .select()
      .from(coverageCandidates)
      .where(and(eq(coverageCandidates.requestId, request_.id), eq(coverageCandidates.status, "invited")));
    const candidateUsers = candidateRows.length
      ? await db.select().from(users).where(inArray(users.id, candidateRows.map((c) => c.userId)))
      : [];

    const shiftLabel = `${shift.date} · ${shift.startTime}–${shift.endTime}${site ? ` · ${site.name}` : ""}`;
    const callList = candidateUsers.length
      ? candidateUsers.map((person) => `${person.name}${person.phone ? ` (${person.phone})` : ""}`).join(", ")
      : "nobody was available to invite";

    const managers = await managersOf(request_.orgId);
    await notifyMany(managers, {
      orgId: request_.orgId,
      type: "coverage_escalated",
      title: "No one has accepted this shift — time to call around",
      body: `${shiftLabel}. Nobody responded within an hour. Try: ${callList}.`,
      entityId: request_.id,
    });
  }

  return NextResponse.json({ ok: true, escalated: stale.length });
}
