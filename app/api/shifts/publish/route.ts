import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { requireUser, requireCapability, withRoute } from "@/lib/api";
import { parseBody, zDate } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

const publishSchema = z.object({ weekStart: zDate, weekEnd: zDate });

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "schedule.publish");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, publishSchema);
  if (validationError) return validationError;

  await db
    .update(shifts)
    .set({ published: 1 })
    .where(and(eq(shifts.orgId, user.orgId), gte(shifts.date, data.weekStart), lte(shifts.date, data.weekEnd)));

  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "shift.publish", "schedule_week", data.weekStart, {
    weekStart: data.weekStart,
    weekEnd: data.weekEnd,
  });

  return NextResponse.json({ ok: true });
});
