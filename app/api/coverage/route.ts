import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { coverageRequests, coverageCandidates, shifts, users, unavailability, absenceRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireRole, badRequest, notFound } from "@/lib/api";
import { newId } from "@/lib/auth";

export async function GET() {
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
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => null);
  if (!body?.shiftId) return badRequest("Specify which shift needs coverage.");

  const [shift] = await db.select().from(shifts).where(and(eq(shifts.id, body.shiftId), eq(shifts.orgId, user.orgId))).limit(1);
  if (!shift) return notFound("Shift not found.");

  await db.update(shifts).set({ userId: null, status: "open" }).where(eq(shifts.id, shift.id));

  const staff = await db.select().from(users).where(eq(users.orgId, user.orgId));
  const unavailableRows = await db.select().from(unavailability).where(eq(unavailability.date, shift.date));
  const approvedLeave = await db.select().from(absenceRequests).where(and(eq(absenceRequests.orgId, user.orgId), eq(absenceRequests.status, "approved")));

  const eligible = staff.filter((person) => {
    if (person.role === "owner") return false;
    if (person.id === shift.userId) return false;
    if ((person.currentLocationId ?? person.homeLocationId) !== shift.locationId) return false;
    if (unavailableRows.some((row) => row.userId === person.id)) return false;
    if (approvedLeave.some((leave) => leave.userId === person.id && shift.date >= leave.startDate && shift.date <= leave.endDate)) return false;
    return true;
  });

  const requestId = newId("coverage");
  await db.insert(coverageRequests).values({
    id: requestId,
    orgId: user.orgId,
    shiftId: shift.id,
    reason: body.reason?.trim() || "Last-minute absence",
    status: "open",
  });

  if (eligible.length > 0) {
    await db.insert(coverageCandidates).values(
      eligible.map((person) => ({
        id: newId("candidate"),
        requestId,
        userId: person.id,
        matchScore: person.occupation === shift.role ? 96 : 85,
        status: "invited" as const,
      }))
    );
  }

  return NextResponse.json({ ok: true, id: requestId, candidateCount: eligible.length });
}
