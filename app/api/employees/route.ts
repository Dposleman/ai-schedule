import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireRole, badRequest } from "@/lib/api";
import { hashPassword, newId } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { organizations } from "@/db/schema";
import crypto from "node:crypto";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db.select().from(users).where(eq(users.orgId, user.orgId));
  const safe = rows.map(({ passwordHash: _passwordHash, ...rest }) => rest);
  return NextResponse.json({ employees: safe });
}

function tempPassword() {
  return crypto.randomBytes(6).toString("base64url");
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => null);
  const name = body?.name?.trim();
  const email = body?.email?.trim()?.toLowerCase();
  const role = body?.role === "owner" ? "owner" : body?.role === "manager" ? "manager" : "employee";

  if (!name || !email) return badRequest("Name and email are required.");
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
    occupation: body?.occupation?.trim() || (role === "manager" ? "Manager" : "Employee"),
    phone: body?.phone?.trim() || "",
    color: colors[Math.floor(Math.random() * colors.length)],
    homeLocationId: body?.locationId || user.currentLocationId,
    currentLocationId: body?.locationId || user.currentLocationId,
    hourlyRateCents: Math.round(Number(body?.hourlyRate) * 100) || 0,
    weeklyHourTarget: Number(body?.weeklyHourTarget) || 37,
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
}
