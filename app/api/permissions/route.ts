import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { permissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireRole } from "@/lib/api";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const [row] = await db.select().from(permissions).where(eq(permissions.orgId, user.orgId)).limit(1);
  return NextResponse.json({ permissions: row ?? null });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => ({}));
  const patch: Partial<typeof permissions.$inferInsert> = {};
  for (const key of ["approveLeave", "moveEmployees", "editPublished", "overrideAI"] as const) {
    if (typeof body[key] === "boolean") patch[key] = body[key] ? 1 : 0;
  }

  await db.update(permissions).set(patch).where(eq(permissions.orgId, user.orgId));
  return NextResponse.json({ ok: true });
}
