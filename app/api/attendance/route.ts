import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUser, badRequest } from "@/lib/api";
import { newId } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const [open] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.userId, user.id), isNull(attendance.checkOutAt)))
    .orderBy(desc(attendance.createdAt))
    .limit(1);
  return NextResponse.json({ open: open ?? null });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await request.json().catch(() => null);

  if (body?.action === "check-in") {
    const id = newId("att");
    await db.insert(attendance).values({
      id,
      orgId: user.orgId,
      shiftId: body.shiftId || null,
      userId: user.id,
      checkInAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, id });
  }

  if (body?.action === "check-out") {
    if (!body?.id) return badRequest("Falta el identificador del fichaje.");
    await db
      .update(attendance)
      .set({ checkOutAt: new Date().toISOString(), autoCheckout: body.auto ? 1 : 0 })
      .where(and(eq(attendance.id, body.id), eq(attendance.userId, user.id)));
    return NextResponse.json({ ok: true });
  }

  return badRequest("Acción no reconocida.");
}
