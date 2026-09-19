import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { dailyTasks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { parseBody, parseQuery, zDate, zId, zText, zTime } from "@/lib/validation";

const listTasksQuerySchema = z.object({ date: zDate.optional() });

export const GET = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const { data, error: validationError } = parseQuery(searchParams, listTasksQuerySchema);
  if (validationError) return validationError;
  const conditions = [eq(dailyTasks.orgId, user.orgId)];
  if (data.date) conditions.push(eq(dailyTasks.date, data.date));
  const rows = await db.select().from(dailyTasks).where(and(...conditions));
  return NextResponse.json({ tasks: rows });
});

const createTaskSchema = z.object({
  name: zText(200),
  locationId: zId,
  date: zDate,
  ownerUserId: zId.optional(),
  dueTime: zTime.optional().default("09:00"),
  automatic: z.boolean().optional().default(false),
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const { data, error: validationError } = await parseBody(request, createTaskSchema);
  if (validationError) return validationError;

  const id = newId("task");
  await db.insert(dailyTasks).values({
    id,
    orgId: user.orgId,
    locationId: data.locationId,
    name: data.name,
    ownerUserId: data.ownerUserId || user.id,
    dueTime: data.dueTime,
    date: data.date,
    automatic: data.automatic ? 1 : 0,
  });
  return NextResponse.json({ ok: true, id });
});
