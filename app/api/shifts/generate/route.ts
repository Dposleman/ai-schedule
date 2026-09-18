import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireRole, badRequest } from "@/lib/api";
import { generateWeekSchedule } from "@/lib/scheduler";

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => ({}));
  if (!body?.weekStart) return badRequest("Falta la fecha de inicio de semana.");

  let locationIds: string[] = body.locationIds;
  if (!locationIds || locationIds.length === 0) {
    const rows = await db.select({ id: locations.id }).from(locations).where(eq(locations.orgId, user.orgId));
    locationIds = rows.map((row) => row.id);
  }

  const result = await generateWeekSchedule(user.orgId, body.weekStart, locationIds);
  return NextResponse.json(result);
}
