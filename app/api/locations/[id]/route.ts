import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { locations, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireRole, notFound } from "@/lib/api";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
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

  const [existing] = await db.select().from(locations).where(and(eq(locations.id, id), eq(locations.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Location not found.");

  await db.update(locations).set(patch).where(eq(locations.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner"]);
  if (permissionError) return permissionError;

  const [existing] = await db.select().from(locations).where(and(eq(locations.id, id), eq(locations.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Location not found.");

  const staffed = await db.select().from(users).where(eq(users.homeLocationId, id));
  if (staffed.length > 0) {
    return NextResponse.json({ error: "Reassign this location's employees before deleting it." }, { status: 409 });
  }

  await db.delete(locations).where(eq(locations.id, id));
  return NextResponse.json({ ok: true });
}
