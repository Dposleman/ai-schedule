import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { requireUser, requireCapability, notFound, badRequest, withRoute } from "@/lib/api";
import { parseBody, zDate, zId, zTime } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

const patchShiftSchema = z.object({
  // Explicitly nullable (not just optional): the client sends userId: null
  // to unassign a shift, which is different from omitting the field.
  userId: z.union([zId, z.null()]).optional(),
  startTime: zTime.optional(),
  endTime: zTime.optional(),
  date: zDate.optional(),
  role: z.string().trim().max(100).optional(),
  force: z.boolean().optional(),
});

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [existing] = await db.select().from(shifts).where(and(eq(shifts.id, id), eq(shifts.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Shift not found.");

  const { data: body, error: validationError } = await parseBody(request, patchShiftSchema);
  if (validationError) return validationError;

  // Once published, editing it is gated by the org's "Edit published
  // schedules" toggle rather than the baseline schedule.edit a manager
  // always has. Reassigning an AI-generated shift away from its pick is
  // gated separately by "Override an AI assignment".
  const permissionError = await requireCapability(user, existing.published === 1 ? "schedule.edit_published" : "schedule.edit");
  if (permissionError) return permissionError;
  if (existing.aiGenerated === 1 && body.userId !== undefined && body.userId !== existing.userId) {
    const overrideError = await requireCapability(user, "schedule.override_ai");
    if (overrideError) return overrideError;
  }

  const patch: Partial<typeof shifts.$inferInsert> = {};
  if (body.userId !== undefined) {
    patch.userId = body.userId || null;
    patch.status = body.userId ? "scheduled" : "open";
  }
  if (body.startTime !== undefined) patch.startTime = body.startTime;
  if (body.endTime !== undefined) patch.endTime = body.endTime;
  if (body.date !== undefined) patch.date = body.date;
  if (body.role !== undefined) patch.role = body.role;

  // Warn instead of silently double-booking: if this assigns (or re-times)
  // a shift for someone, make sure it doesn't overlap another shift they're
  // already assigned to on the same day.
  const assigneeId = patch.userId !== undefined ? patch.userId : existing.userId;
  if (assigneeId && !body.force) {
    const newStart = patch.startTime ?? existing.startTime;
    const newEnd = patch.endTime ?? existing.endTime;
    const sameDayShifts = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.orgId, user.orgId), eq(shifts.userId, assigneeId), eq(shifts.date, patch.date ?? existing.date), ne(shifts.id, id)));
    const conflict = sameDayShifts.find((s) => timesOverlap(newStart, newEnd, s.startTime, s.endTime));
    if (conflict) {
      return badRequest(
        `This person is already scheduled ${conflict.startTime}–${conflict.endTime} that day — assign anyway with force:true if that's intentional.`
      );
    }
  }

  await db.update(shifts).set(patch).where(eq(shifts.id, id));
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "shift.update", "shift", id, {
    date: existing.date,
    ...patch,
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = withRoute(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [existing] = await db.select().from(shifts).where(and(eq(shifts.id, id), eq(shifts.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Shift not found.");

  const permissionError = await requireCapability(user, existing.published === 1 ? "schedule.edit_published" : "schedule.edit");
  if (permissionError) return permissionError;

  await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.orgId, user.orgId)));
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "shift.delete", "shift", id, {
    date: existing.date,
    userId: existing.userId,
  });
  return NextResponse.json({ ok: true });
});
