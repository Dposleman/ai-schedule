import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, requireCapability, notFound, withRoute } from "@/lib/api";
import { parseBody, zId } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

const patchEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  occupation: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  currentLocationId: zId.optional(),
  homeLocationId: zId.optional(),
  hourlyRate: z.coerce.number().nonnegative().optional(),
  weeklyHourTarget: z.coerce.number().nonnegative().optional(),
  monthlyHourTarget: z.coerce.number().nonnegative().optional(),
  role: z.enum(["owner", "manager", "employee"]).optional(),
});

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [target] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, user.orgId))).limit(1);
  if (!target) return notFound("Employee not found.");

  const isSelf = target.id === user.id;
  if (!isSelf) {
    const permissionError = await requireCapability(user, "employees.manage");
    if (permissionError) return permissionError;
    if (target.role === "owner" && user.role !== "owner") {
      return NextResponse.json({ error: "A manager cannot modify an owner." }, { status: 403 });
    }
  }

  const { data, error: validationError } = await parseBody(request, patchEmployeeSchema);
  if (validationError) return validationError;

  // Self-service edits are limited to contact info. Location and occupation
  // influence scheduling eligibility and coverage matching, so — like role,
  // home location, pay rate and weekly hour target — they're management-only
  // even when editing your own record; moving yourself between locations or
  // relabeling your own occupation would otherwise be a silent way to
  // sidestep scheduling policy.
  const patch: Partial<typeof users.$inferInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.occupation !== undefined && !isSelf) patch.occupation = data.occupation;
  if (data.currentLocationId !== undefined && !isSelf) patch.currentLocationId = data.currentLocationId;
  if (data.homeLocationId !== undefined && !isSelf) patch.homeLocationId = data.homeLocationId;
  if (data.hourlyRate !== undefined && !isSelf) patch.hourlyRateCents = Math.round(data.hourlyRate * 100);
  if (data.weeklyHourTarget !== undefined && !isSelf) patch.weeklyHourTarget = data.weeklyHourTarget;
  if (data.monthlyHourTarget !== undefined && !isSelf) patch.monthlyHourTarget = data.monthlyHourTarget;
  if (data.role !== undefined && user.role === "owner" && !isSelf) patch.role = data.role;

  await db.update(users).set(patch).where(eq(users.id, id));
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "employee.update", "user", id, patch);
  return NextResponse.json({ ok: true });
});

export const DELETE = withRoute(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "employees.delete");
  if (permissionError) return permissionError;

  const [target] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, user.orgId))).limit(1);
  if (!target) return notFound("Employee not found.");
  if (target.id === user.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 403 });
  }
  if (target.role === "owner" && user.role !== "owner") {
    return NextResponse.json({ error: "A manager cannot delete an owner." }, { status: 403 });
  }

  await db.delete(users).where(eq(users.id, id));
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "employee.delete", "user", id, {
    name: target.name,
    email: target.email,
  });
  return NextResponse.json({ ok: true });
});
