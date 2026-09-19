import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { coverageRequests, coverageCandidates, shifts } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { requireUser, notFound, badRequest, withRoute } from "@/lib/api";
import { notifyCoverageAccepted } from "@/lib/coverage";
import { rangesOverlap } from "@/lib/time";
import { recordAuditEvent } from "@/lib/audit";

type AcceptOutcome =
  | { kind: "not_found" }
  | { kind: "not_invited" }
  | { kind: "already_taken" }
  | { kind: "conflict" }
  | { kind: "ok" };

export const POST = withRoute(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  // Everything below runs in one transaction: the conditional UPDATE (only
  // succeeds while status is still "open") gives us row-level locking from
  // Postgres itself, so two employees accepting the same open shift at the
  // same instant can never both win — the second one's UPDATE simply
  // affects zero rows once the first has committed. Wrapping the rest of
  // the writes in the same transaction means none of them are left
  // half-applied if a later step fails.
  const outcome = await db.transaction(async (tx) => {
    const [coverageRequest] = await tx
      .select()
      .from(coverageRequests)
      .where(and(eq(coverageRequests.id, id), eq(coverageRequests.orgId, user.orgId)))
      .limit(1);
    if (!coverageRequest) return { kind: "not_found" } satisfies AcceptOutcome;
    if (coverageRequest.status !== "open") return { kind: "already_taken" } satisfies AcceptOutcome;

    const [candidate] = await tx
      .select()
      .from(coverageCandidates)
      .where(and(eq(coverageCandidates.requestId, id), eq(coverageCandidates.userId, user.id)))
      .limit(1);
    if (!candidate) return { kind: "not_invited" } satisfies AcceptOutcome;

    const [shift] = await tx.select().from(shifts).where(eq(shifts.id, coverageRequest.shiftId)).limit(1);
    if (!shift) return { kind: "not_found" } satisfies AcceptOutcome;

    // Re-check for a scheduling conflict at acceptance time too — the
    // invite-time check (lib/coverage.ts) can be stale by the time someone
    // actually accepts (they could have picked up another shift meanwhile).
    const sameDayShifts = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.orgId, user.orgId), eq(shifts.date, shift.date), eq(shifts.userId, user.id), ne(shifts.id, shift.id)));
    const hasConflict = sameDayShifts.some((s) => rangesOverlap(s.startTime, s.endTime, shift.startTime, shift.endTime));
    if (hasConflict) return { kind: "conflict" } satisfies AcceptOutcome;

    const closed = await tx
      .update(coverageRequests)
      .set({ status: "closed", acceptedByUserId: user.id })
      .where(and(eq(coverageRequests.id, id), eq(coverageRequests.status, "open")))
      .returning({ id: coverageRequests.id });
    if (closed.length === 0) return { kind: "already_taken" } satisfies AcceptOutcome;

    await tx.update(coverageCandidates).set({ status: "accepted" }).where(eq(coverageCandidates.id, candidate.id));
    await tx
      .update(coverageCandidates)
      .set({ status: "declined" })
      .where(and(eq(coverageCandidates.requestId, id), eq(coverageCandidates.status, "invited")));
    await tx.update(shifts).set({ userId: user.id, status: "scheduled" }).where(eq(shifts.id, coverageRequest.shiftId));

    return { kind: "ok" } satisfies AcceptOutcome;
  });

  if (outcome.kind === "not_found") return notFound("Coverage request not found.");
  if (outcome.kind === "not_invited") return badRequest("You weren't invited to cover this shift.");
  if (outcome.kind === "already_taken") return badRequest("This shift has already been assigned.");
  if (outcome.kind === "conflict") return badRequest("You already have a shift that overlaps this time.");

  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "coverage.accept", "coverage_request", id, {});
  await notifyCoverageAccepted(user.orgId, id, user.id);
  return NextResponse.json({ ok: true });
});
