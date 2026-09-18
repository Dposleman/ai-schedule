import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireRole, badRequest } from "@/lib/api";
import { hashPassword, newId } from "@/lib/auth";
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

  if (!name || !email) return badRequest("Nombre y correo son obligatorios.");
  if (role === "owner" && user.role !== "owner") {
    return NextResponse.json({ error: "Solo un propietario puede crear otro propietario." }, { status: 403 });
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return badRequest("Ya existe una cuenta con ese correo.");

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
    occupation: body?.occupation?.trim() || (role === "manager" ? "Manager" : "Empleado"),
    phone: body?.phone?.trim() || "",
    color: colors[Math.floor(Math.random() * colors.length)],
    homeLocationId: body?.locationId || user.currentLocationId,
    currentLocationId: body?.locationId || user.currentLocationId,
    hourlyRateCents: Math.round(Number(body?.hourlyRate) * 100) || 0,
    weeklyHourTarget: Number(body?.weeklyHourTarget) || 37,
  });

  return NextResponse.json({ ok: true, id, temporaryPassword: password });
}
