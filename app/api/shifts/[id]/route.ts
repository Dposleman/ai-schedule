import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireRole, notFound } from "@/lib/api";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const [existing] = await db.select().from(shifts).where(and(eq(shifts.id, id), eq(shifts.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Shift not found.");

  const body = await request.json().catch(() => ({}));
  const patch: Partial<typeof shifts.$inferInsert> = {};
  if (body.userId !== undefined) {
    patch.userId = body.userId || null;
    patch.status = body.userId ? "scheduled" : "open";
  }
  if (typeof body.startTime === "string") patch.startTime = body.startTime;
  if (typeof body.endTime === "string") patch.endTime = body.endTime;
  if (typeof body.role === "string") patch.role = body.role;

  await db.update(shifts).set(patch).where(eq(shifts.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.orgId, user.orgId)));
  return NextResponse.json({ ok: true });
}
