import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { transfers, users, locations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireCapability, notFound, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { parseBody, zDate, zId } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(transfers).where(eq(transfers.orgId, user.orgId));
  return NextResponse.json({ transfers: rows });
});

const createTransferSchema = z.object({
  userId: zId,
  toLocationId: zId,
  startDate: zDate,
  endDate: z.union([zDate, z.null()]).optional(),
  type: z.enum(["temporary", "permanent"]).optional().default("temporary"),
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "employees.transfer");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, createTransferSchema);
  if (validationError) return validationError;

  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, data.userId), eq(users.orgId, user.orgId)))
    .limit(1);
  if (!target) return notFound("Employee not found.");

  const [destination] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, data.toLocationId), eq(locations.orgId, user.orgId)))
    .limit(1);
  if (!destination) return notFound("Location not found.");

  const id = newId("transfer");
  // A future-dated transfer shouldn't move the employee yet — only apply
  // the location change immediately when it's already in effect (today or
  // earlier). A future startDate is picked up later by the
  // transfer-activation cron (app/api/cron/transfer-activation/route.ts),
  // the same pattern as the coverage-escalation cron.
  const today = new Date().toISOString().slice(0, 10);
  const takesEffectNow = data.startDate <= today;

  await db.insert(transfers).values({
    id,
    orgId: user.orgId,
    userId: data.userId,
    fromLocationId: target.currentLocationId ?? target.homeLocationId ?? "",
    toLocationId: data.toLocationId,
    type: data.type,
    startDate: data.startDate,
    endDate: data.endDate || null,
    status: "active",
    activatedAt: takesEffectNow ? new Date().toISOString() : null,
  });

  if (takesEffectNow) {
    await db
      .update(users)
      .set({
        currentLocationId: data.toLocationId,
        homeLocationId: data.type === "permanent" ? data.toLocationId : target.homeLocationId,
      })
      .where(eq(users.id, data.userId));
  }

  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "transfer.create", "transfer", id, {
    userId: data.userId,
    toLocationId: data.toLocationId,
    type: data.type,
    startsImmediately: takesEffectNow,
  });

  return NextResponse.json({ ok: true, id });
});
