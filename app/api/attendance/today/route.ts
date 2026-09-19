import { NextResponse } from "next/server";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import { requireUser, withRoute } from "@/lib/api";

// Org-wide attendance rows for today, for the Overview screen's "today
// staffing / attendance exceptions" panel (master prompt 11.4). Fields
// returned are purely operational (who clocked in/out and when) — no
// compensation data, so unlike /api/employees there's nothing here that
// needs stripping per role. In practice only owner/manager ever render
// this (Overview isn't in the employee nav), but the endpoint itself
// stays safe to call from any authenticated org member.
export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const rows = await db
    .select({
      id: attendance.id,
      userId: attendance.userId,
      shiftId: attendance.shiftId,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
    })
    .from(attendance)
    .where(and(eq(attendance.orgId, user.orgId), gte(attendance.createdAt, todayStart), lt(attendance.createdAt, tomorrowStart)));

  return NextResponse.json({ attendance: rows });
});
