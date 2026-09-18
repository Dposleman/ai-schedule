import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dailyTasks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, badRequest } from "@/lib/api";
import { newId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const conditions = [eq(dailyTasks.orgId, user.orgId)];
  if (date) conditions.push(eq(dailyTasks.date, date));
  const rows = await db.select().from(dailyTasks).where(and(...conditions));
  return NextResponse.json({ tasks: rows });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body?.name?.trim() || !body?.locationId || !body?.date) return badRequest("Missing task data.");

  const id = newId("task");
  await db.insert(dailyTasks).values({
    id,
    orgId: user.orgId,
    locationId: body.locationId,
    name: body.name.trim(),
    ownerUserId: body.ownerUserId || user.id,
    dueTime: body.dueTime || "09:00",
    date: body.date,
    automatic: body.automatic ? 1 : 0,
  });
  return NextResponse.json({ ok: true, id });
}
