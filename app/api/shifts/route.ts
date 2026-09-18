import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { requireUser, requireRole, badRequest, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";

export const GET = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const conditions = [eq(shifts.orgId, user.orgId)];
  if (from) conditions.push(gte(shifts.date, from));
  if (to) conditions.push(lte(shifts.date, to));

  let rows = await db.select().from(shifts).where(and(...conditions));
  // Employees only ever see their own shifts once published; managers/owners see everything.
  if (user.role === "employee") {
    rows = rows.filter((shift) => shift.published === 1 && (shift.userId === user.id || shift.status === "open"));
  }
  return NextResponse.json({ shifts: rows });
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => null);
  if (!body?.locationId || !body?.date || !body?.startTime || !body?.endTime) {
    return badRequest("Missing shift data.");
  }

  const id = newId("shift");
  await db.insert(shifts).values({
    id,
    orgId: user.orgId,
    locationId: body.locationId,
    userId: body.userId || null,
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
    role: body.role || "",
    status: body.userId ? "scheduled" : "open",
    published: 1,
  });
  return NextResponse.json({ ok: true, id });
});
