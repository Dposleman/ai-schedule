import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { unavailability } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, badRequest } from "@/lib/api";
import { newId } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(unavailability).where(eq(unavailability.userId, user.id));
  return NextResponse.json({ dates: rows.map((row) => row.date) });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body?.date) return badRequest("Falta la fecha.");

  const [existing] = await db
    .select()
    .from(unavailability)
    .where(and(eq(unavailability.userId, user.id), eq(unavailability.date, body.date)))
    .limit(1);

  if (existing) {
    await db.delete(unavailability).where(eq(unavailability.id, existing.id));
    return NextResponse.json({ ok: true, blocked: false });
  }

  await db.insert(unavailability).values({ id: newId("unavail"), userId: user.id, date: body.date });
  return NextResponse.json({ ok: true, blocked: true });
}
