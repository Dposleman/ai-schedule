import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { absenceRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, badRequest } from "@/lib/api";
import { newId } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  let rows = await db.select().from(absenceRequests).where(eq(absenceRequests.orgId, user.orgId));
  if (user.role === "employee") rows = rows.filter((row) => row.userId === user.id);
  return NextResponse.json({ absences: rows });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body?.startDate || !body?.endDate) return badRequest("Specify the requested period.");

  const id = newId("abs");
  await db.insert(absenceRequests).values({
    id,
    orgId: user.orgId,
    userId: user.id,
    type: body.type === "sick" ? "sick" : body.type === "unavailable" ? "unavailable" : "vacation",
    startDate: body.startDate,
    endDate: body.endDate,
    note: body.note?.trim() || "",
    status: user.role === "owner" ? "approved" : "pending",
  });
  return NextResponse.json({ ok: true, id });
}
