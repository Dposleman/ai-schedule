import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attendance, locations } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUser, badRequest } from "@/lib/api";
import { newId } from "@/lib/auth";
import { distanceInMeters, GPS_ACCURACY_SLACK_METERS } from "@/lib/geo";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const [open] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.userId, user.id), isNull(attendance.checkOutAt)))
    .orderBy(desc(attendance.createdAt))
    .limit(1);
  return NextResponse.json({ open: open ?? null });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await request.json().catch(() => null);

  if (body?.action === "check-in") {
    // The client only shows the button once it thinks you're in range — but
    // that's just UX. The server re-checks independently, against the real
    // radius, before it ever writes the check-in: never trust client-side math.
    const locationId = body?.locationId || user.currentLocationId || user.homeLocationId;
    if (!locationId) return badRequest("No location on file to check in against.");
    const [site] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
    if (!site) return badRequest("Location not found.");

    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return badRequest("Missing device location — enable GPS and try again.");
    }
    const distance = distanceInMeters(lat, lng, site.latitude, site.longitude);
    if (distance > site.radiusMeters + GPS_ACCURACY_SLACK_METERS) {
      return badRequest(`You're ${Math.round(distance)}m from ${site.name} — too far to check in (allowed radius: ${site.radiusMeters}m).`);
    }

    const id = newId("att");
    await db.insert(attendance).values({
      id,
      orgId: user.orgId,
      shiftId: body.shiftId || null,
      userId: user.id,
      checkInAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, id });
  }

  if (body?.action === "check-out") {
    if (!body?.id) return badRequest("Missing check-in identifier.");
    await db
      .update(attendance)
      .set({ checkOutAt: new Date().toISOString(), autoCheckout: body.auto ? 1 : 0 })
      .where(and(eq(attendance.id, body.id), eq(attendance.userId, user.id)));
    return NextResponse.json({ ok: true });
  }

  return badRequest("Unrecognized action.");
}
