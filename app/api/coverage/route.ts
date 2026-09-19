import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { coverageRequests, coverageCandidates, shifts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireCapability, badRequest, notFound, withRoute } from "@/lib/api";
import { openCoverageForShift } from "@/lib/coverage";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const requests = await db.select().from(coverageRequests).where(eq(coverageRequests.orgId, user.orgId));
  const candidates = await db.select().from(coverageCandidates);
  const shiftRows = await db.select().from(shifts).where(eq(shifts.orgId, user.orgId));

  const enriched = requests.map((request) => ({
    ...request,
    shift: shiftRows.find((shift) => shift.id === request.shiftId) ?? null,
    candidates: candidates.filter((candidate) => candidate.requestId === request.id),
  }));

  if (user.role === "employee") {
    return NextResponse.json({
      requests: enriched.filter((request) => request.candidates.some((candidate) => candidate.userId === user.id)),
    });
  }
  return NextResponse.json({ requests: enriched });
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "coverage.manage");
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => null);
  if (!body?.shiftId) return badRequest("Specify which shift needs coverage.");

  const result = await openCoverageForShift(user.orgId, body.shiftId, body.reason?.trim());
  if (!result) return notFound("Shift not found.");

  return NextResponse.json({ ok: true, id: result.requestId, candidateCount: result.candidateCount });
});
