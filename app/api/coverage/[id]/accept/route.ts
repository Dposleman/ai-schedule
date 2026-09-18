import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { coverageRequests, coverageCandidates, shifts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, notFound, badRequest } from "@/lib/api";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [coverageRequest] = await db.select().from(coverageRequests).where(and(eq(coverageRequests.id, id), eq(coverageRequests.orgId, user.orgId))).limit(1);
  if (!coverageRequest) return notFound("Solicitud de cobertura no encontrada.");
  if (coverageRequest.status !== "open") return badRequest("Este turno ya fue asignado.");

  const [candidate] = await db
    .select()
    .from(coverageCandidates)
    .where(and(eq(coverageCandidates.requestId, id), eq(coverageCandidates.userId, user.id)))
    .limit(1);
  if (!candidate) return badRequest("No fuiste invitado a cubrir este turno.");

  await db.update(coverageRequests).set({ status: "closed", acceptedByUserId: user.id }).where(eq(coverageRequests.id, id));
  await db.update(coverageCandidates).set({ status: "accepted" }).where(eq(coverageCandidates.id, candidate.id));
  await db
    .update(coverageCandidates)
    .set({ status: "declined" })
    .where(and(eq(coverageCandidates.requestId, id), eq(coverageCandidates.status, "invited")));
  await db.update(shifts).set({ userId: user.id, status: "scheduled" }).where(eq(shifts.id, coverageRequest.shiftId));

  return NextResponse.json({ ok: true });
}
