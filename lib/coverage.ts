import { db } from "@/db";
import { coverageRequests, coverageCandidates, shifts, users, unavailability, absenceRequests, locations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/auth";
import { notify, notifyMany, managersOf } from "@/lib/notifications";

/**
 * Opens a shift back up and invites every compatible, available person at
 * that location to cover it — the same flow whether a manager triggers it
 * by hand (see app/api/coverage/route.ts) or it fires automatically because
 * an absence was approved (see app/api/absences/[id]/route.ts).
 */
export async function openCoverageForShift(orgId: string, shiftId: string, reason: string) {
  const [shift] = await db.select().from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.orgId, orgId))).limit(1);
  if (!shift) return null;

  await db.update(shifts).set({ userId: null, status: "open" }).where(eq(shifts.id, shift.id));

  const staff = await db.select().from(users).where(eq(users.orgId, orgId));
  const unavailableRows = await db.select().from(unavailability).where(eq(unavailability.date, shift.date));
  const approvedLeave = await db.select().from(absenceRequests).where(and(eq(absenceRequests.orgId, orgId), eq(absenceRequests.status, "approved")));

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
    orgId,
    shiftId: shift.id,
    reason: reason || "Last-minute absence",
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

  const [site] = await db.select().from(locations).where(eq(locations.id, shift.locationId)).limit(1);
  const shiftLabel = `${shift.date} · ${shift.startTime}–${shift.endTime}${site ? ` · ${site.name}` : ""}`;

  await notifyMany(eligible.map((p) => p.id), {
    orgId,
    type: "coverage_invite",
    title: "Open shift available",
    body: `${shiftLabel} — first to accept gets it.`,
    entityId: requestId,
  });

  const managers = await managersOf(orgId);
  await notifyMany(managers, {
    orgId,
    type: "coverage_needed",
    title: eligible.length > 0 ? "Looking for coverage" : "Uncovered shift — no one available",
    body: eligible.length > 0
      ? `${shiftLabel}. Invited ${eligible.length} available ${eligible.length === 1 ? "person" : "people"}.`
      : `${shiftLabel}. Nobody at that location is available — you may need to call around.`,
    entityId: requestId,
  });

  return { requestId, candidateCount: eligible.length };
}

export async function notifyCoverageAccepted(orgId: string, requestId: string, acceptedByUserId: string) {
  const [accepted] = await db.select().from(users).where(eq(users.id, acceptedByUserId)).limit(1);
  const managers = await managersOf(orgId);
  await notify({
    orgId,
    userId: managers[0] ?? acceptedByUserId,
    type: "coverage_accepted",
    title: "Shift covered",
    body: `${accepted?.name ?? "Someone"} picked up the open shift.`,
    entityId: requestId,
  }).catch(() => {});
  if (managers.length > 1) {
    await notifyMany(managers.slice(1), {
      orgId,
      type: "coverage_accepted",
      title: "Shift covered",
      body: `${accepted?.name ?? "Someone"} picked up the open shift.`,
      entityId: requestId,
    });
  }
}
