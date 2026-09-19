import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { absenceRequests, shifts } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { requireUser, requireCapability, notFound, withRoute } from "@/lib/api";
import { openCoverageForShift } from "@/lib/coverage";
import { notify } from "@/lib/notifications";
import { parseBody } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

const decideAbsenceSchema = z.object({ status: z.enum(["approved", "rejected"], { error: "Invalid status." }) });

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "absences.approve");
  if (permissionError) return permissionError;

  const { data: body, error: validationError } = await parseBody(request, decideAbsenceSchema);
  if (validationError) return validationError;

  const [existing] = await db.select().from(absenceRequests).where(and(eq(absenceRequests.id, id), eq(absenceRequests.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Request not found.");

  await db.update(absenceRequests).set({ status: body.status }).where(eq(absenceRequests.id, id));
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "absence.decide", "absence_request", id, {
    status: body.status,
    userId: existing.userId,
    startDate: existing.startDate,
    endDate: existing.endDate,
  });

  await notify({
    orgId: user.orgId,
    userId: existing.userId,
    type: "absence_decided",
    title: body.status === "approved" ? "Your time off was approved" : "Your time off request was declined",
    body: `${existing.startDate} → ${existing.endDate}`,
    entityId: id,
  });

  // Sick leave already triggered coverage search when it was requested
  // (see app/api/absences/route.ts) — approving it here doesn't need to
  // redo that. Planned leave (vacation/unavailable) only affects the
  // schedule once approved, so that's when it opens coverage.
  if (body.status === "approved" && existing.type !== "sick") {
    const affected = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.orgId, user.orgId),
          eq(shifts.userId, existing.userId),
          eq(shifts.published, 1),
          gte(shifts.date, existing.startDate),
          lte(shifts.date, existing.endDate)
        )
      );
    for (const shift of affected) {
      await openCoverageForShift(user.orgId, shift.id, "Approved leave");
    }
  }

  return NextResponse.json({ ok: true });
});
