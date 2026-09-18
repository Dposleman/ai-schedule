import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireRole, badRequest, withRoute } from "@/lib/api";
import { generateWeekSchedule } from "@/lib/scheduler";

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => ({}));
  if (!body?.weekStart) return badRequest("Missing week start date.");

  let locationIds: string[] = body.locationIds;
  if (!locationIds || locationIds.length === 0) {
    const rows = await db.select({ id: locations.id }).from(locations).where(eq(locations.orgId, user.orgId));
    locationIds = rows.map((row) => row.id);
  }

  const result = await generateWeekSchedule(user.orgId, body.weekStart, locationIds);
  return NextResponse.json(result);
});
