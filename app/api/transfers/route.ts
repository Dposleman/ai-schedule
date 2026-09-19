import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { transfers, users, locations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireCapability, notFound, withRoute } from "@/lib/api";
import { newId } from "@/lib/auth";
import { parseBody, zDate, zId } from "@/lib/validation";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(transfers).where(eq(transfers.orgId, user.orgId));
  return NextResponse.json({ transfers: rows });
});

const createTransferSchema = z.object({
  userId: zId,
  toLocationId: zId,
  startDate: zDate,
  endDate: z.union([zDate, z.null()]).optional(),
  type: z.enum(["temporary", "permanent"]).optional().default("temporary"),
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "employees.transfer");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, createTransferSchema);
  if (validationError) return validationError;

  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, data.userId), eq(users.orgId, user.orgId)))
    .limit(1);
  if (!target) return notFound("Employee not found.");

  const [destination] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, data.toLocationId), eq(locations.orgId, user.orgId)))
    .limit(1);
  if (!destination) return notFound("Location not found.");

  const id = newId("transfer");
  await db.insert(transfers).values({
    id,
    orgId: user.orgId,
    userId: data.userId,
    fromLocationId: target.currentLocationId ?? target.homeLocationId ?? "",
    toLocationId: data.toLocationId,
    type: data.type,
    startDate: data.startDate,
    endDate: data.endDate || null,
    status: "active",
  });

  await db
    .update(users)
    .set({
      currentLocationId: data.toLocationId,
      homeLocationId: data.type === "permanent" ? data.toLocationId : target.homeLocationId,
    })
    .where(eq(users.id, data.userId));

  return NextResponse.json({ ok: true, id });
});
