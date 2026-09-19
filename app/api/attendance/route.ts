import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { attendance, locations } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUser, badRequest, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { distanceInMeters, GPS_ACCURACY_SLACK_METERS } from "@/lib/geo";
import { zId } from "@/lib/validation";

const gpsCoord = z.coerce.number({ error: "Missing device location — enable GPS and try again." });

const attendanceBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("check-in"),
    locationId: zId.optional(),
    shiftId: zId.optional(),
    lat: gpsCoord,
    lng: gpsCoord,
  }),
  z.object({
    action: z.literal("check-out"),
    id: zId,
    auto: z.boolean().optional(),
  }),
]);

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const [open] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.userId, user.id), isNull(attendance.checkOutAt)))
    .orderBy(desc(attendance.createdAt))
    .limit(1);
  return NextResponse.json({ open: open ?? null });
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const json = await request.json().catch(() => null);
  const parsed = attendanceBodySchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || "Unrecognized action.");
  const body = parsed.data;

  if (body.action === "check-in") {
    // The client only shows the button once it thinks you're in range — but
    // that's just UX. The server re-checks independently, against the real
    // radius, before it ever writes the check-in: never trust client-side math.
    const locationId = body.locationId || user.currentLocationId || user.homeLocationId;
    if (!locationId) return badRequest("No location on file to check in against.");
    const [site] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.orgId, user.orgId)))
      .limit(1);
    if (!site) return badRequest("Location not found.");

    // Guard against a double clock-in from a flaky connection / double tap:
    // one open (not-yet-checked-out) session per person, enforced here and
    // backed by a unique partial index in the database (see ensureSchema).
    const [alreadyOpen] = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.userId, user.id), isNull(attendance.checkOutAt)))
      .limit(1);
    if (alreadyOpen) return badRequest("You already have an open shift clocked in — clock out first.");

    const distance = distanceInMeters(body.lat, body.lng, site.latitude, site.longitude);
    if (distance > site.radiusMeters + GPS_ACCURACY_SLACK_METERS) {
      return badRequest(`You're ${Math.round(distance)}m from ${site.name} — too far to check in (allowed radius: ${site.radiusMeters}m).`);
    }

    const id = newId("att");
    try {
      await db.insert(attendance).values({
        id,
        orgId: user.orgId,
        shiftId: body.shiftId || null,
        userId: user.id,
        checkInAt: new Date().toISOString(),
      });
    } catch (err) {
      // Belt-and-suspenders: the DB's unique partial index rejects a second
      // concurrent open session even if two requests raced past the check above.
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        return badRequest("You already have an open shift clocked in — clock out first.");
      }
      throw err;
    }
    return NextResponse.json({ ok: true, id });
  }

  // body.action === "check-out"
  await db
    .update(attendance)
    .set({ checkOutAt: new Date().toISOString(), autoCheckout: body.auto ? 1 : 0 })
    .where(and(eq(attendance.id, body.id), eq(attendance.userId, user.id)));
  return NextResponse.json({ ok: true });
});
