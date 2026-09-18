import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireRole, badRequest, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(locations).where(eq(locations.orgId, user.orgId));
  return NextResponse.json({ locations: rows });
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) return badRequest("The location needs a name.");

  const id = newId("loc");
  await db.insert(locations).values({
    id,
    orgId: user.orgId,
    name: body.name.trim(),
    address: body.address?.trim() || "",
    openHours: body.openHours?.trim() || "08:00–23:00",
    latitude: Number(body.latitude) || 55.6761,
    longitude: Number(body.longitude) || 12.5683,
    radiusMeters: Number(body.radiusMeters) || 50,
    budgetCents: Math.round(Number(body.budget) * 100) || 0,
  });
  return NextResponse.json({ ok: true, id });
});
