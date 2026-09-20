import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendance, attendanceIntegrityEvents, locations } from "@/db/schema";
import { newId } from "@/lib/auth";
import { distanceInMeters, GPS_ACCURACY_SLACK_METERS } from "@/lib/geo";

export const MAX_LOCATION_ACCURACY_METERS = 100;
export const PRESENCE_FAILURE_THRESHOLD = 3;

export type PresenceStatus = "VERIFIED" | "PRESENCE_DEGRADED" | "PRESENCE_UNCERTAIN" | "PRESENCE_LOST";

type PresenceInput = {
  attendanceId: string; orgId: string; userId: string; locationId: string;
  lat: number; lng: number; accuracy: number; event?: "HEARTBEAT" | "CLOCK_IN" | "CLOCK_OUT";
};

/** Server-side geofence verification. The client location is evidence only;
 * all timestamps and final attendance state are determined here. */
export async function verifyPresence(input: PresenceInput) {
  const [site, record] = await Promise.all([
    db.select().from(locations).where(and(eq(locations.id, input.locationId), eq(locations.orgId, input.orgId))).limit(1),
    db.select().from(attendance).where(and(eq(attendance.id, input.attendanceId), eq(attendance.orgId, input.orgId), eq(attendance.userId, input.userId))).limit(1),
  ]);
  const location = site[0];
  const current = record[0];
  if (!location || !location.verified) return { ok: false, code: "WORKPLACE_GEOFENCE_MISCONFIGURED" as const };
  if (!current) return { ok: false, code: "ATTENDANCE_NOT_FOUND" as const };

  const now = new Date().toISOString();
  const distance = distanceInMeters(input.lat, input.lng, location.latitude, location.longitude);
  const accurate = input.accuracy <= MAX_LOCATION_ACCURACY_METERS;
  const withinFence = distance <= location.radiusMeters + GPS_ACCURACY_SLACK_METERS;
  const ok = accurate && withinFence;
  const failures = ok ? 0 : current.consecutivePresenceFailures + 1;
  const status: PresenceStatus = ok ? "VERIFIED" : failures >= PRESENCE_FAILURE_THRESHOLD ? "PRESENCE_LOST" : failures >= 2 ? "PRESENCE_UNCERTAIN" : "PRESENCE_DEGRADED";
  const code = !accurate ? "LOCATION_INACCURATE" : !withinFence ? "LOCATION_OUTSIDE_GEOFENCE" : null;

  await db.update(attendance).set({
    presenceStatus: status, consecutivePresenceFailures: failures, lastHeartbeatAt: now,
    lastVerifiedPresenceAt: ok ? now : current.lastVerifiedPresenceAt,
    firstSuspiciousAt: ok ? null : current.firstSuspiciousAt ?? now,
    requiresReview: status === "PRESENCE_LOST" ? 1 : current.requiresReview,
  }).where(eq(attendance.id, current.id));
  await db.insert(attendanceIntegrityEvents).values({
    id: newId("aie"), orgId: input.orgId, attendanceId: current.id, userId: input.userId,
    type: input.event ?? "HEARTBEAT", status, distanceMeters: Math.round(distance), accuracyMeters: Math.round(input.accuracy),
    metadata: JSON.stringify({ code, radiusMeters: location.radiusMeters, verifiedAt: now }),
  });
  return { ok, code, status, distanceMeters: Math.round(distance), accuracyMeters: Math.round(input.accuracy), checkedAt: now };
}
