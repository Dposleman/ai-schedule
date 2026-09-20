import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireCapability, notFound, badRequest, withRoute } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

// Manager correction/approval of a single attendance record (timesheet
// review, master prompt 11.4). checkInAt/checkOutAt are corrected together
// as a pair (not merged field-by-field against what's already stored) so a
// manager always sees and confirms the full resulting interval, not just
// the one field they touched.
const patchAttendanceSchema = z.object({
  checkInAt: z.string().datetime().optional(),
  checkOutAt: z.string().datetime().nullable().optional(),
  approved: z.boolean().optional(),
  correctionReason: z.string().trim().min(5).max(1000).optional(),
});

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "attendance.manage");
  if (permissionError) return permissionError;

  const [existing] = await db.select().from(attendance).where(and(eq(attendance.id, id), eq(attendance.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Attendance record not found.");

  const { data, error: validationError } = await parseBody(request, patchAttendanceSchema);
  if (validationError) return validationError;

  const nextCheckIn = data.checkInAt ?? existing.checkInAt;
  const nextCheckOut = data.checkOutAt !== undefined ? data.checkOutAt : existing.checkOutAt;
  if (nextCheckIn && nextCheckOut && new Date(nextCheckOut).getTime() <= new Date(nextCheckIn).getTime()) {
    return badRequest("Check-out must be after check-in.");
  }

  const isCorrection = data.checkInAt !== undefined || data.checkOutAt !== undefined;
  if (isCorrection && !data.correctionReason) return badRequest("A correction reason is required.");
  const patch: Partial<typeof attendance.$inferInsert> = {};
  if (data.checkInAt !== undefined) patch.checkInAt = data.checkInAt;
  if (data.checkOutAt !== undefined) patch.checkOutAt = data.checkOutAt;

  if (isCorrection) {
    // A correction resets approval — the previous approval was for the old
    // times, not the corrected ones, so it must be reviewed again rather
    // than silently carrying an approval that no longer matches the data.
    patch.approved = 0;
    patch.approvedBy = null;
    patch.approvedAt = null;
  } else if (data.approved !== undefined) {
    patch.approved = data.approved ? 1 : 0;
    patch.approvedBy = data.approved ? user.id : null;
    patch.approvedAt = data.approved ? new Date().toISOString() : null;
  }

  await db.update(attendance).set(patch).where(eq(attendance.id, id));
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, isCorrection ? "attendance.correct" : "attendance.approve", "attendance", id, { ...patch, correctionReason: data.correctionReason });
  return NextResponse.json({ ok: true });
});
