import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transfers, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireRole, badRequest, notFound } from "@/lib/api";
import { newId } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(transfers).where(eq(transfers.orgId, user.orgId));
  return NextResponse.json({ transfers: rows });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => null);
  if (!body?.userId || !body?.toLocationId || !body?.startDate) return badRequest("Missing transfer data.");

  const [target] = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
  if (!target) return notFound("Employee not found.");

  const id = newId("transfer");
  await db.insert(transfers).values({
    id,
    orgId: user.orgId,
    userId: body.userId,
    fromLocationId: target.currentLocationId ?? target.homeLocationId ?? "",
    toLocationId: body.toLocationId,
    type: body.type === "permanent" ? "permanent" : "temporary",
    startDate: body.startDate,
    endDate: body.endDate || null,
    status: "active",
  });

  await db
    .update(users)
    .set({
      currentLocationId: body.toLocationId,
      homeLocationId: body.type === "permanent" ? body.toLocationId : target.homeLocationId,
    })
    .where(eq(users.id, body.userId));

  return NextResponse.json({ ok: true, id });
}
