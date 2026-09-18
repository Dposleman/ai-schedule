import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { absenceRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireRole, notFound, badRequest } from "@/lib/api";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => ({}));
  if (body.status !== "approved" && body.status !== "rejected") return badRequest("Invalid status.");

  const [existing] = await db.select().from(absenceRequests).where(and(eq(absenceRequests.id, id), eq(absenceRequests.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Request not found.");

  await db.update(absenceRequests).set({ status: body.status }).where(eq(absenceRequests.id, id));
  return NextResponse.json({ ok: true });
}
