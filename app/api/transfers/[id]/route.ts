import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { transfers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireCapability, notFound, withRoute } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

const patchTransferSchema = z.object({ status: z.enum(["completed"]).optional() });

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "employees.transfer");
  if (permissionError) return permissionError;

  const [existing] = await db.select().from(transfers).where(and(eq(transfers.id, id), eq(transfers.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Transfer not found.");

  const { data, error: validationError } = await parseBody(request, patchTransferSchema);
  if (validationError) return validationError;
  if (data.status === "completed") {
    await db.update(transfers).set({ status: "completed" }).where(eq(transfers.id, id));
    // Only a temporary transfer reverts the employee to where they came
    // from. A permanent transfer's destination *is* their location now —
    // "completing" it just closes the record, it must never move them back
    // to fromLocationId.
    if (existing.type === "temporary") {
      await db.update(users).set({ currentLocationId: existing.fromLocationId }).where(eq(users.id, existing.userId));
    }
    await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "transfer.complete", "transfer", id, {
      userId: existing.userId,
      reverted: existing.type === "temporary",
    });
  }
  return NextResponse.json({ ok: true });
});
