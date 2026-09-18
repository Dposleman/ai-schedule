import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transfers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireRole, notFound } from "@/lib/api";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const [existing] = await db.select().from(transfers).where(and(eq(transfers.id, id), eq(transfers.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Traslado no encontrado.");

  const body = await request.json().catch(() => ({}));
  if (body.status === "completed") {
    await db.update(transfers).set({ status: "completed" }).where(eq(transfers.id, id));
    await db.update(users).set({ currentLocationId: existing.fromLocationId }).where(eq(users.id, existing.userId));
  }
  return NextResponse.json({ ok: true });
}
