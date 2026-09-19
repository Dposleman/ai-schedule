import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireCapability, badRequest, withRoute } from "@/lib/api";
import { hashPassword, newId } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { organizations } from "@/db/schema";
import { parseBody, zEmail, zId, zText } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import crypto from "node:crypto";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(users).where(eq(users.orgId, user.orgId));
  // Compensation (hourlyRateCents, weeklyHourTarget) is management-only data
  // — an ordinary employee calling this endpoint (e.g. for the Team/Staff
  // directory) must never see a colleague's, or even their own, pay rate
  // through it. Owners and managers get the full row.
  const canSeeCompensation = user.role === "owner" || user.role === "manager";
  const safe = rows.map(({ passwordHash: _passwordHash, hourlyRateCents, weeklyHourTarget, ...rest }) =>
    canSeeCompensation ? { ...rest, hourlyRateCents, weeklyHourTarget } : rest
  );
  return NextResponse.json({ employees: safe });
});

function tempPassword() {
  return crypto.randomBytes(6).toString("base64url");
}

const createEmployeeSchema = z.object({
  name: zText(200),
  email: zEmail,
  role: z.enum(["owner", "manager", "employee"]).optional().default("employee"),
  occupation: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  locationId: zId.optional(),
  hourlyRate: z.coerce.number().nonnegative().optional().default(0),
  weeklyHourTarget: z.coerce.number().nonnegative().optional().default(37),
});

export const POST = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "employees.manage");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, createEmployeeSchema);
  if (validationError) return validationError;
  const { name, email, role } = data;

  if (role === "owner" && user.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can create another owner." }, { status: 403 });
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return badRequest("An account with that email already exists.");

  const colors = ["blue", "green", "orange", "pink", "lilac"];
  const password = tempPassword();
  const id = newId("user");
  await db.insert(users).values({
    id,
    orgId: user.orgId,
    name,
    email,
    passwordHash: hashPassword(password),
    role,
    occupation: data.occupation || (role === "manager" ? "Manager" : "Employee"),
    phone: data.phone || "",
    color: colors[Math.floor(Math.random() * colors.length)],
    homeLocationId: data.locationId || user.currentLocationId,
    currentLocationId: data.locationId || user.currentLocationId,
    hourlyRateCents: Math.round(data.hourlyRate * 100),
    weeklyHourTarget: data.weeklyHourTarget,
  });

  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "employee.create", "user", id, {
    name,
    email,
    role,
  });

  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId)).limit(1);
  const origin = request.headers.get("origin") || undefined;
  const emailed = await sendWelcomeEmail({
    to: email,
    name,
    email,
    password,
    businessName: org?.name,
    appUrl: origin,
  });

  return NextResponse.json({ ok: true, id, temporaryPassword: emailed ? null : password, emailed });
});
