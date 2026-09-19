import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireCapability, withRoute } from "@/lib/api";
import { generateWeekSchedule } from "@/lib/scheduler";
import { parseBody, zDate, zId } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

const generateSchema = z.object({
  weekStart: zDate,
  locationIds: z.array(zId).optional(),
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "schedule.generate");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, generateSchema);
  if (validationError) return validationError;

  let locationIds = data.locationIds;
  if (!locationIds || locationIds.length === 0) {
    const rows = await db.select({ id: locations.id }).from(locations).where(eq(locations.orgId, user.orgId));
    locationIds = rows.map((row) => row.id);
  }

  const result = await generateWeekSchedule(user.orgId, data.weekStart, locationIds);
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "schedule.generate", "schedule_week", data.weekStart, {
    locationIds,
    created: result.created,
    open: result.open,
  });
  return NextResponse.json(result);
});
