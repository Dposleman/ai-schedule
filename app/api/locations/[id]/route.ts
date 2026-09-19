import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { locations, users, shifts, dailyTasks, transfers } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { requireUser, requireCapability, notFound, withRoute } from "@/lib/api";
import { parseBody, zDataUriImage } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

const MAX_LOGO_BYTES = 600_000;

const patchLocationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  address: z.string().trim().max(300).optional(),
  openHours: z.string().trim().max(100).optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  radiusMeters: z.coerce.number().nonnegative().optional(),
  budget: z.coerce.number().nonnegative().optional(),
  logoUrl: z.union([zDataUriImage(MAX_LOGO_BYTES), z.null()]).optional(),
});

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "locations.manage");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, patchLocationSchema);
  if (validationError) return validationError;

  const patch: Partial<typeof locations.$inferInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.address !== undefined) patch.address = data.address;
  if (data.openHours !== undefined) patch.openHours = data.openHours;
  if (data.latitude !== undefined) patch.latitude = data.latitude;
  if (data.longitude !== undefined) patch.longitude = data.longitude;
  if (data.radiusMeters !== undefined) patch.radiusMeters = data.radiusMeters;
  if (data.budget !== undefined) patch.budgetCents = Math.round(data.budget * 100);
  if (data.logoUrl !== undefined) patch.logoUrl = data.logoUrl;

  const [existing] = await db.select().from(locations).where(and(eq(locations.id, id), eq(locations.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Location not found.");

  await db.update(locations).set(patch).where(eq(locations.id, id));
  const { logoUrl: _loggedLogoUrl, ...patchForLog } = patch;
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "location.update", "location", id, {
    ...patchForLog,
    logoUrlChanged: data.logoUrl !== undefined,
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = withRoute(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "locations.delete");
  if (permissionError) return permissionError;

  const [existing] = await db.select().from(locations).where(and(eq(locations.id, id), eq(locations.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Location not found.");

  const staffed = await db
    .select()
    .from(users)
    .where(or(eq(users.homeLocationId, id), eq(users.currentLocationId, id)));
  if (staffed.length > 0) {
    return NextResponse.json({ error: "Reassign this location's employees before deleting it." }, { status: 409 });
  }

  const [upcomingShift] = await db.select().from(shifts).where(eq(shifts.locationId, id)).limit(1);
  if (upcomingShift) {
    return NextResponse.json({ error: "This location still has shifts on the schedule — remove or reassign them first." }, { status: 409 });
  }

  const [pendingTask] = await db.select().from(dailyTasks).where(eq(dailyTasks.locationId, id)).limit(1);
  if (pendingTask) {
    return NextResponse.json({ error: "This location still has daily tasks assigned — remove them first." }, { status: 409 });
  }

  // Transfer records (even completed ones) reference this location and can't
  // be reassigned — unlike shifts/tasks, there's nothing to "remove first",
  // so a location with any transfer history can never be deleted, only kept.
  const [linkedTransfer] = await db
    .select()
    .from(transfers)
    .where(or(eq(transfers.fromLocationId, id), eq(transfers.toLocationId, id)))
    .limit(1);
  if (linkedTransfer) {
    return NextResponse.json({ error: "This location has transfer history and can't be deleted." }, { status: 409 });
  }

  await db.delete(locations).where(eq(locations.id, id));
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "location.delete", "location", id, {
    name: existing.name,
  });
  return NextResponse.json({ ok: true });
});
