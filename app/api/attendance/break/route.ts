import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { attendance, attendanceBreaks } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser, badRequest, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { zId } from "@/lib/validation";

// Break start/stop for the current, self-owned open attendance session
// (master prompt 11.4 timesheet: "scheduled vs actual, breaks, variance").
// Deliberately scoped to "my own open session" only — a break is something
// the employee starts and ends themselves in real time, not something a
// manager schedules; manager review of the resulting minutes happens
// read-only via GET /api/attendance/timesheet.
const breakBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("end"), id: zId }),
]);

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const json = await request.json().catch(() => null);
  const parsed = breakBodySchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || "Unrecognized action.");
  const body = parsed.data;

  const [open] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.userId, user.id), isNull(attendance.checkOutAt)))
    .limit(1);
  if (!open) return badRequest("You need to be clocked in to take a break.");

  if (body.action === "start") {
    const [alreadyOnBreak] = await db
      .select()
      .from(attendanceBreaks)
      .where(and(eq(attendanceBreaks.attendanceId, open.id), isNull(attendanceBreaks.endAt)))
      .limit(1);
    if (alreadyOnBreak) return badRequest("You're already on a break.");
    const id = newId("brk");
    await db.insert(attendanceBreaks).values({
      id,
      orgId: user.orgId,
      attendanceId: open.id,
      userId: user.id,
      startAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, id });
  }

  // body.action === "end"
  await db
    .update(attendanceBreaks)
    .set({ endAt: new Date().toISOString() })
    .where(and(eq(attendanceBreaks.id, body.id), eq(attendanceBreaks.userId, user.id), eq(attendanceBreaks.attendanceId, open.id)));
  return NextResponse.json({ ok: true });
});
