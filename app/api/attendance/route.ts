import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { attendance, attendanceBreaks, locations, shifts } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUser, badRequest, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { distanceInMeters, GPS_ACCURACY_SLACK_METERS } from "@/lib/geo";
import { timeToMinutes } from "@/lib/time";
import { zId } from "@/lib/validation";

// How early/late a clock-in is accepted relative to the shift's own
// start/end. Wide enough for an early arrival or a shift running long,
// narrow enough that it can't be used to clock into a shift on a
// different day or shifted by hours.
const CLOCK_IN_WINDOW_MINUTES_BEFORE = 30;
const CLOCK_IN_WINDOW_MINUTES_AFTER_END = 60;

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
  let openBreak = null;
  if (open) {
    [openBreak] = await db
      .select()
      .from(attendanceBreaks)
      .where(and(eq(attendanceBreaks.attendanceId, open.id), isNull(attendanceBreaks.endAt)))
      .limit(1);
  }
  return NextResponse.json({ open: open ?? null, openBreak: openBreak ?? null });
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
    // A brand-new location defaults to placeholder coordinates until a
    // manager confirms the real pin (PATCH /api/locations/[id] with both
    // latitude and longitude sets verified=1) — GPS check-in against an
    // unconfirmed location would just be validating distance to nowhere.
    if (!site.verified) {
      return badRequest(`${site.name} doesn't have a confirmed location yet — ask a manager to set it in Locations before clocking in with GPS.`);
    }

    // If a shift is claimed, bind the check-in to it for real: it must
    // belong to this user, in this org, at this location, and the current
    // time must fall inside a reasonable window around the shift's own
    // start/end — otherwise a shiftId is just an unvalidated free-text
    // pointer and check-in isn't actually tied to the schedule at all.
    if (body.shiftId) {
      const [shift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, body.shiftId), eq(shifts.orgId, user.orgId)))
        .limit(1);
      if (!shift) return badRequest("That shift no longer exists.");
      if (shift.userId !== user.id) return badRequest("That shift isn't assigned to you.");
      if (shift.locationId !== locationId) return badRequest("That shift is at a different location.");
      const today = new Date().toISOString().slice(0, 10);
      if (shift.date !== today) return badRequest("That shift isn't scheduled for today.");
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
      const windowStart = timeToMinutes(shift.startTime) - CLOCK_IN_WINDOW_MINUTES_BEFORE;
      const windowEnd = timeToMinutes(shift.endTime) + CLOCK_IN_WINDOW_MINUTES_AFTER_END;
      if (nowMinutes < windowStart || nowMinutes > windowEnd) {
        return badRequest(`Check-in for this shift is only allowed from ${shift.startTime} onward.`);
      }
    }

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
  const now = new Date().toISOString();
  // Close out any break still running under this session — checking out
  // implicitly ends it rather than leaving an open-ended break row behind
  // (which would otherwise show as "still on break" forever in review).
  await db
    .update(attendanceBreaks)
    .set({ endAt: now })
    .where(and(eq(attendanceBreaks.attendanceId, body.id), eq(attendanceBreaks.userId, user.id), isNull(attendanceBreaks.endAt)));
  await db
    .update(attendance)
    .set({ checkOutAt: now, autoCheckout: body.auto ? 1 : 0 })
    .where(and(eq(attendance.id, body.id), eq(attendance.userId, user.id)));
  return NextResponse.json({ ok: true });
});
