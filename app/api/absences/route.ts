import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { absenceRequests, shifts } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { requireUser, badRequest, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { openCoverageForShift } from "@/lib/coverage";
import { notifyMany, managersOf } from "@/lib/notifications";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  let rows = await db.select().from(absenceRequests).where(eq(absenceRequests.orgId, user.orgId));
  if (user.role === "employee") rows = rows.filter((row) => row.userId === user.id);
  return NextResponse.json({ absences: rows });
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body?.startDate || !body?.endDate) return badRequest("Specify the requested period.");

  const id = newId("abs");
  const type = body.type === "sick" ? "sick" : body.type === "unavailable" ? "unavailable" : "vacation";
  const status = user.role === "owner" ? "approved" : "pending";
  await db.insert(absenceRequests).values({
    id,
    orgId: user.orgId,
    userId: user.id,
    type,
    startDate: body.startDate,
    endDate: body.endDate,
    note: body.note?.trim() || "",
    status,
  });

  const managers = await managersOf(user.orgId);
  await notifyMany(managers.filter((managerId) => managerId !== user.id), {
    orgId: user.orgId,
    type: "absence_requested",
    title: type === "sick" ? `${user.name} called in sick` : `${user.name} requested time off`,
    body: `${body.startDate} → ${body.endDate}${body.note?.trim() ? ` — "${body.note.trim()}"` : ""}`,
    entityId: id,
  });

  // Sick leave is urgent — don't wait for a manager to click "approve"
  // before looking for someone to cover the affected shifts. Planned leave
  // (vacation/unavailable) still waits for approval, unless the requester
  // is the owner, whose own requests are auto-approved above.
  if (type === "sick" || status === "approved") {
    const affected = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.orgId, user.orgId),
          eq(shifts.userId, user.id),
          eq(shifts.published, 1),
          gte(shifts.date, body.startDate),
          lte(shifts.date, body.endDate)
        )
      );
    for (const shift of affected) {
      await openCoverageForShift(user.orgId, shift.id, type === "sick" ? `${user.name} called in sick` : `${user.name} is on approved leave`);
    }
  }

  return NextResponse.json({ ok: true, id });
});
