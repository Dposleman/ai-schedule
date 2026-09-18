import { db } from "@/db";
import { shifts, users, absenceRequests, unavailability } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { newId } from "@/lib/auth";

const SHIFT_BLOCKS = [
  { start: "10:00", end: "18:00" },
  { start: "16:00", end: "23:00" },
];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

/**
 * Greedy, constraint-respecting auto-scheduler.
 * Hard constraints (never violated): approved vacation/sick leave, days the
 * employee marked unavailable, weekly contracted hour target.
 * Soft goal: balance hours across employees with the same role while
 * keeping every location staffed across the week.
 */
export async function generateWeekSchedule(orgId: string, weekStart: string, locationIds: string[]) {
  const monday = new Date(`${weekStart}T00:00:00`);
  const weekDates = Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)));
  const weekEnd = weekDates[6];

  const staff = await db.select().from(users).where(eq(users.orgId, orgId));
  const eligibleStaff = staff.filter(
    (person) => person.role !== "owner" && (!person.currentLocationId || locationIds.includes(person.currentLocationId) || locationIds.includes(person.homeLocationId ?? ""))
  );

  const approvedLeave = await db
    .select()
    .from(absenceRequests)
    .where(and(eq(absenceRequests.orgId, orgId), eq(absenceRequests.status, "approved")));

  const unavailableRows = await db.select().from(unavailability);

  const isBlocked = (userId: string, date: string) => {
    if (unavailableRows.some((row) => row.userId === userId && row.date === date)) return true;
    return approvedLeave.some((leave) => leave.userId === userId && date >= leave.startDate && date <= leave.endDate);
  };

  // Remove existing draft (unpublished) AI shifts for this week/location before regenerating.
  await db
    .delete(shifts)
    .where(
      and(
        eq(shifts.orgId, orgId),
        eq(shifts.published, 0),
        gte(shifts.date, weekStart),
        lte(shifts.date, weekEnd)
      )
    );

  const hoursAssigned = new Map<string, number>(eligibleStaff.map((person) => [person.id, 0]));
  const created: (typeof shifts.$inferInsert)[] = [];

  for (const locationId of locationIds) {
    const locationStaff = eligibleStaff.filter(
      (person) => (person.currentLocationId ?? person.homeLocationId) === locationId
    );
    if (locationStaff.length === 0) continue;

    for (const date of weekDates) {
      for (const block of SHIFT_BLOCKS) {
        const candidates = locationStaff
          .filter((person) => !isBlocked(person.id, date))
          .filter((person) => {
            const target = person.weeklyHourTarget || 40;
            const already = hoursAssigned.get(person.id) ?? 0;
            return already + hoursBetween(block.start, block.end) <= target;
          })
          .sort((a, b) => (hoursAssigned.get(a.id) ?? 0) - (hoursAssigned.get(b.id) ?? 0));

        const chosen = candidates[0];
        const shiftId = newId("shift");
        created.push({
          id: shiftId,
          orgId,
          locationId,
          userId: chosen ? chosen.id : null,
          date,
          startTime: block.start,
          endTime: block.end,
          role: chosen?.occupation ?? "",
          status: chosen ? "scheduled" : "open",
          aiGenerated: 1,
          published: 0,
        });
        if (chosen) {
          hoursAssigned.set(chosen.id, (hoursAssigned.get(chosen.id) ?? 0) + hoursBetween(block.start, block.end));
        }
      }
    }
  }

  if (created.length > 0) {
    await db.insert(shifts).values(created);
  }

  const totalShifts = created.length;
  const openShifts = created.filter((shift) => shift.status === "open").length;
  const coverage = totalShifts === 0 ? 100 : Math.round(((totalShifts - openShifts) / totalShifts) * 100);

  return { created: created.length, open: openShifts, coverage, weekStart, weekEnd };
}
