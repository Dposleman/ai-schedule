import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { organizations, users, locations, permissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, newId, setSessionCookie } from "@/lib/auth";
import { badRequest, withRoute } from "@/lib/api";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

export const POST = withRoute(async (request: NextRequest) => {
  await ensureSchema();
  const body = await request.json().catch(() => null);
  const businessName = body?.businessName?.trim();
  const name = body?.name?.trim();
  const email = body?.email?.trim()?.toLowerCase();
  const password = body?.password;
  const locationName = body?.locationName?.trim() || "Mi primer local";

  if (!businessName || !name || !email || !password || password.length < 8) {
    return badRequest("Fill in all fields. The password must be at least 8 characters.");
  }

  if (isRateLimited(`signup:${clientIp(request)}`, 8, 15 * 60 * 1000)) {
    return badRequest("Too many attempts — please wait a few minutes and try again.");
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return badRequest("An account with that email already exists.");

  const orgId = newId("org");
  const locationId = newId("loc");
  const userId = newId("user");

  await db.insert(organizations).values({ id: orgId, name: businessName });
  await db.insert(locations).values({ id: locationId, orgId, name: locationName });
  await db.insert(users).values({
    id: userId,
    orgId,
    name,
    email,
    passwordHash: hashPassword(password),
    role: "owner",
    occupation: "Owner",
    color: "pink",
    homeLocationId: locationId,
    currentLocationId: locationId,
  });
  await db.insert(permissions).values({ orgId });

  await setSessionCookie(userId);
  return NextResponse.json({ ok: true });
});
