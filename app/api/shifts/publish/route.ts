import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { requireUser, requireCapability, badRequest, withRoute } from "@/lib/api";

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "schedule.publish");
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => ({}));
  if (!body?.weekStart || !body?.weekEnd) return badRequest("Missing week range.");

  await db
    .update(shifts)
    .set({ published: 1 })
    .where(and(eq(shifts.orgId, user.orgId), gte(shifts.date, body.weekStart), lte(shifts.date, body.weekEnd)));

  return NextResponse.json({ ok: true });
});
