import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { coverageRequests, coverageCandidates, shifts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, notFound, badRequest, withRoute } from "@/lib/api";
import { notifyCoverageAccepted } from "@/lib/coverage";

export const POST = withRoute(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [coverageRequest] = await db.select().from(coverageRequests).where(and(eq(coverageRequests.id, id), eq(coverageRequests.orgId, user.orgId))).limit(1);
  if (!coverageRequest) return notFound("Coverage request not found.");
  if (coverageRequest.status !== "open") return badRequest("This shift has already been assigned.");

  const [candidate] = await db
    .select()
    .from(coverageCandidates)
    .where(and(eq(coverageCandidates.requestId, id), eq(coverageCandidates.userId, user.id)))
    .limit(1);
  if (!candidate) return badRequest("You weren't invited to cover this shift.");

  await db.update(coverageRequests).set({ status: "closed", acceptedByUserId: user.id }).where(eq(coverageRequests.id, id));
  await db.update(coverageCandidates).set({ status: "accepted" }).where(eq(coverageCandidates.id, candidate.id));
  await db
    .update(coverageCandidates)
    .set({ status: "declined" })
    .where(and(eq(coverageCandidates.requestId, id), eq(coverageCandidates.status, "invited")));
  await db.update(shifts).set({ userId: user.id, status: "scheduled" }).where(eq(shifts.id, coverageRequest.shiftId));
  await notifyCoverageAccepted(user.orgId, id, user.id);

  return NextResponse.json({ ok: true });
});
