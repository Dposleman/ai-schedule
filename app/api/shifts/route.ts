import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { requireUser, requireCapability, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { parseBody, parseQuery, zDate, zId, zTime } from "@/lib/validation";

const listShiftsQuerySchema = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
});

export const GET = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const { data, error: validationError } = parseQuery(searchParams, listShiftsQuerySchema);
  if (validationError) return validationError;

  const conditions = [eq(shifts.orgId, user.orgId)];
  if (data.from) conditions.push(gte(shifts.date, data.from));
  if (data.to) conditions.push(lte(shifts.date, data.to));

  let rows = await db.select().from(shifts).where(and(...conditions));
  // Employees only ever see their own shifts once published; managers/owners see everything.
  if (user.role === "employee") {
    rows = rows.filter((shift) => shift.published === 1 && (shift.userId === user.id || shift.status === "open"));
  }
  return NextResponse.json({ shifts: rows });
});

const createShiftSchema = z.object({
  locationId: zId,
  userId: zId.optional(),
  date: zDate,
  startTime: zTime,
  endTime: zTime,
  role: z.string().trim().max(100).optional().default(""),
  published: z.boolean().optional().default(true),
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "schedule.edit");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, createShiftSchema);
  if (validationError) return validationError;

  const id = newId("shift");
  await db.insert(shifts).values({
    id,
    orgId: user.orgId,
    locationId: data.locationId,
    userId: data.userId || null,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    role: data.role,
    status: data.userId ? "scheduled" : "open",
    published: data.published ? 1 : 0,
  });
  return NextResponse.json({ ok: true, id });
});
