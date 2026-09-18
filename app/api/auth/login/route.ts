import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { badRequest } from "@/lib/api";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  const password = body?.password;
  if (!email || !password) return badRequest("Escribe tu correo y contraseña.");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return badRequest("Correo o contraseña incorrectos.");
  }

  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true });
}
