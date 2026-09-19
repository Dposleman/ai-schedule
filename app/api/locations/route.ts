import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireCapability, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { parseBody, zText } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

const numberOr = (fallback: number) => z.coerce.number().optional().transform((value) => (value === undefined || Number.isNaN(value) ? fallback : value));

const createLocationSchema = z.object({
  name: zText(200),
  address: z.string().trim().max(300).optional().default(""),
  openHours: z.string().trim().max(100).optional().transform((v) => (v && v.length > 0 ? v : "08:00–23:00")),
  latitude: numberOr(55.6761),
  longitude: numberOr(12.5683),
  radiusMeters: numberOr(50),
  budget: numberOr(0),
});

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(locations).where(eq(locations.orgId, user.orgId));
  return NextResponse.json({ locations: rows });
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "locations.manage");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, createLocationSchema);
  if (validationError) return validationError;

  const id = newId("loc");
  await db.insert(locations).values({
    id,
    orgId: user.orgId,
    name: data.name,
    address: data.address,
    openHours: data.openHours,
    latitude: data.latitude,
    longitude: data.longitude,
    radiusMeters: data.radiusMeters,
    budgetCents: Math.round(data.budget * 100),
  });
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "location.create", "location", id, {
    name: data.name,
  });
  return NextResponse.json({ ok: true, id });
});
