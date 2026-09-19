import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { locations, users, shifts, dailyTasks, transfers } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { requireUser, requireCapability, notFound, badRequest, withRoute } from "@/lib/api";

const MAX_LOGO_BYTES = 600_000;

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "locations.manage");
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => ({}));
  const patch: Partial<typeof locations.$inferInsert> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.address === "string") patch.address = body.address.trim();
  if (typeof body.openHours === "string") patch.openHours = body.openHours.trim();
  if (body.latitude !== undefined) patch.latitude = Number(body.latitude);
  if (body.longitude !== undefined) patch.longitude = Number(body.longitude);
  if (body.radiusMeters !== undefined) patch.radiusMeters = Number(body.radiusMeters);
  if (body.budget !== undefined) patch.budgetCents = Math.round(Number(body.budget) * 100);
  if (body.logoUrl === null) patch.logoUrl = null;
  else if (typeof body.logoUrl === "string") {
    if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(body.logoUrl)) {
      return badRequest("Logo must be an uploaded image.");
    }
    if (body.logoUrl.length > MAX_LOGO_BYTES) return badRequest("That image is too large — try something under ~400KB.");
    patch.logoUrl = body.logoUrl;
  }

  const [existing] = await db.select().from(locations).where(and(eq(locations.id, id), eq(locations.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Location not found.");

  await db.update(locations).set(patch).where(eq(locations.id, id));
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
  return NextResponse.json({ ok: true });
});
