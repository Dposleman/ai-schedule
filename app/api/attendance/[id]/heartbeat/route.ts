import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { attendance, shifts } from "@/db/schema";
import { badRequest, requireUser, withRoute } from "@/lib/api";
import { verifyPresence } from "@/lib/shift-integrity";
import { isRateLimited } from "@/lib/rate-limit";

const bodySchema = z.object({ lat: z.coerce.number(), lng: z.coerce.number(), accuracy: z.coerce.number().nonnegative() });

export const POST = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { user, error } = await requireUser();
  if (error) return error;
  if (await isRateLimited(`attendance-heartbeat:${user.id}`, 18, 60_000)) {
    return NextResponse.json({ ok: false, code: "HEARTBEAT_RATE_LIMITED" }, { status: 429 });
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("A current GPS position and accuracy are required.");
  const [record] = await db.select().from(attendance).where(and(eq(attendance.id, id), eq(attendance.orgId, user.orgId), eq(attendance.userId, user.id), isNull(attendance.checkOutAt))).limit(1);
  if (!record) return NextResponse.json({ ok: false, code: "ATTENDANCE_NOT_FOUND" }, { status: 404 });
  const [shift] = record.shiftId ? await db.select().from(shifts).where(and(eq(shifts.id, record.shiftId), eq(shifts.orgId, user.orgId))).limit(1) : [];
  const locationId = shift?.locationId ?? user.currentLocationId ?? user.homeLocationId;
  if (!locationId) return NextResponse.json({ ok: false, code: "WORKPLACE_GEOFENCE_MISCONFIGURED" }, { status: 409 });
  const integrity = await verifyPresence({ attendanceId: id, orgId: user.orgId, userId: user.id, locationId, ...parsed.data });
  return NextResponse.json(integrity, { status: integrity.ok ? 200 : 409 });
});
