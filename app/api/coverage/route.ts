import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { coverageRequests, coverageCandidates, shifts } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireUser, requireCapability, notFound, withRoute } from "@/lib/api";
import { openCoverageForShift } from "@/lib/coverage";
import { parseBody, zId } from "@/lib/validation";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const requests = await db.select().from(coverageRequests).where(eq(coverageRequests.orgId, user.orgId));
  // Scoped to this org's own request IDs instead of pulling every org's
  // candidate rows into memory and filtering client-side in JS.
  const candidates = requests.length
    ? await db.select().from(coverageCandidates).where(inArray(coverageCandidates.requestId, requests.map((r) => r.id)))
    : [];
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

const requestCoverageSchema = z.object({
  shiftId: zId,
  reason: z.string().trim().max(500).optional().default(""),
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "coverage.manage");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, requestCoverageSchema);
  if (validationError) return validationError;

  const result = await openCoverageForShift(user.orgId, data.shiftId, data.reason);
  if (!result) return notFound("Shift not found.");

  return NextResponse.json({ ok: true, id: result.requestId, candidateCount: result.candidateCount });
});
