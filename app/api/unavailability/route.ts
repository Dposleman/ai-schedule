import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { unavailability } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { parseBody, zDate } from "@/lib/validation";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(unavailability).where(eq(unavailability.userId, user.id));
  return NextResponse.json({ dates: rows.map((row) => row.date) });
});

const toggleUnavailabilitySchema = z.object({ date: zDate });

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const { data, error: validationError } = await parseBody(request, toggleUnavailabilitySchema);
  if (validationError) return validationError;

  const [existing] = await db
    .select()
    .from(unavailability)
    .where(and(eq(unavailability.userId, user.id), eq(unavailability.date, data.date)))
    .limit(1);

  if (existing) {
    await db.delete(unavailability).where(eq(unavailability.id, existing.id));
    return NextResponse.json({ ok: true, blocked: false });
  }

  await db.insert(unavailability).values({ id: newId("unavail"), orgId: user.orgId, userId: user.id, date: data.date });
  return NextResponse.json({ ok: true, blocked: true });
});
