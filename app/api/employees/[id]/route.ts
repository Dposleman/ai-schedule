import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireRole, notFound, withRoute } from "@/lib/api";

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [target] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, user.orgId))).limit(1);
  if (!target) return notFound("Employee not found.");

  const isSelf = target.id === user.id;
  if (!isSelf) {
    const permissionError = requireRole(user, ["owner", "manager"]);
    if (permissionError) return permissionError;
    if (target.role === "owner" && user.role !== "owner") {
      return NextResponse.json({ error: "A manager cannot modify an owner." }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const patch: Partial<typeof users.$inferInsert> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.occupation === "string") patch.occupation = body.occupation.trim();
  if (typeof body.phone === "string") patch.phone = body.phone.trim();
  if (typeof body.currentLocationId === "string") patch.currentLocationId = body.currentLocationId;
  if (typeof body.homeLocationId === "string" && !isSelf) patch.homeLocationId = body.homeLocationId;
  if (body.hourlyRate !== undefined && !isSelf) patch.hourlyRateCents = Math.round(Number(body.hourlyRate) * 100);
  if (body.weeklyHourTarget !== undefined && !isSelf) patch.weeklyHourTarget = Number(body.weeklyHourTarget);
  if (typeof body.role === "string" && user.role === "owner" && !isSelf) patch.role = body.role;

  await db.update(users).set(patch).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
});

export const DELETE = withRoute(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const [target] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, user.orgId))).limit(1);
  if (!target) return notFound("Employee not found.");
  if (target.id === user.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 403 });
  }
  if (target.role === "owner" && user.role !== "owner") {
    return NextResponse.json({ error: "A manager cannot delete an owner." }, { status: 403 });
  }

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
});
