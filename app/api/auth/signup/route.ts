import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/db";
import { organizations, users, locations, permissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, newId, setSessionCookie } from "@/lib/auth";
import { badRequest, withRoute } from "@/lib/api";
import { parseBody, zEmail, zText } from "@/lib/validation";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

const signupSchema = z.object({
  businessName: zText(200),
  name: zText(200),
  email: zEmail,
  password: z.string().min(8, "The password must be at least 8 characters.").max(200),
  locationName: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : "Mi primer local")),
});

export const POST = withRoute(async (request: NextRequest) => {
  await ensureSchema();
  const { data, error } = await parseBody(request, signupSchema);
  if (error) return badRequest("Fill in all fields. The password must be at least 8 characters.");
  const { businessName, name, email, password, locationName } = data;

  if (await isRateLimited(`signup:${clientIp(request)}`, 8, 15 * 60 * 1000)) {
    return badRequest("Too many attempts — please wait a few minutes and try again.");
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return badRequest("An account with that email already exists.");

  const orgId = newId("org");
  const locationId = newId("loc");
  const userId = newId("user");

  // All four rows are one logical "create an organization" operation — if
  // any insert fails partway through (a constraint violation, a dropped
  // connection), the transaction rolls back the whole thing instead of
  // leaving an org with no owner, or a user with no permissions row.
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({ id: orgId, name: businessName });
    await tx.insert(locations).values({ id: locationId, orgId, name: locationName });
    await tx.insert(users).values({
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
    await tx.insert(permissions).values({ orgId });
  });

  await setSessionCookie(userId);
  return NextResponse.json({ ok: true });
});
