import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { attendance, shifts, users } from "@/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import { requireUser, requireCapability, withRoute } from "@/lib/api";
import { parseQuery, zDate } from "@/lib/validation";

// Manager timesheet review (master prompt 11.4): scheduled vs. actual for a
// week, so a manager can see variance and approve/correct records — see
// PATCH /api/attendance/[id] for the write side. Attendance rows aren't
// stored with a plain date column (only checkInAt/checkOutAt timestamps and
// an optional shiftId), so the week window is applied against checkInAt.
const timesheetQuerySchema = z.object({ weekStart: zDate, weekEnd: zDate });

export const GET = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "attendance.manage");
  if (permissionError) return permissionError;

  const { searchParams } = new URL(request.url);
  const { data, error: validationError } = parseQuery(searchParams, timesheetQuerySchema);
  if (validationError) return validationError;

  const windowStart = `${data.weekStart}T00:00:00.000Z`;
  const windowEnd = `${data.weekEnd}T23:59:59.999Z`;

  const rows = await db
    .select({
      id: attendance.id,
      userId: attendance.userId,
      userName: users.name,
      shiftId: attendance.shiftId,
      shiftDate: shifts.date,
      shiftStart: shifts.startTime,
      shiftEnd: shifts.endTime,
      shiftLocationId: shifts.locationId,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      autoCheckout: attendance.autoCheckout,
      approved: attendance.approved,
      approvedBy: attendance.approvedBy,
      approvedAt: attendance.approvedAt,
    })
    .from(attendance)
    .leftJoin(shifts, eq(attendance.shiftId, shifts.id))
    .innerJoin(users, eq(attendance.userId, users.id))
    .where(and(eq(attendance.orgId, user.orgId), gte(attendance.checkInAt, windowStart), lt(attendance.checkInAt, windowEnd)));

  return NextResponse.json({ records: rows });
});
