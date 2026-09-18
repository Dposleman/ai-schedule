import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireRole, badRequest, notFound } from "@/lib/api";

// Logos are stored as data: URIs directly on the row — small enough (capped
// below) that this beats standing up object storage just for this, and
// keeps upload/download a single request with no extra infra to configure.
const MAX_LOGO_BYTES = 600_000;

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId)).limit(1);
  if (!org) return notFound("Organization not found.");
  return NextResponse.json({ organization: org });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = requireRole(user, ["owner", "manager"]);
  if (permissionError) return permissionError;

  const body = await request.json().catch(() => ({}));
  const patch: Partial<typeof organizations.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.logoUrl === null) patch.logoUrl = null;
  else if (typeof body.logoUrl === "string") {
    if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(body.logoUrl)) {
      return badRequest("Logo must be an uploaded image.");
    }
    if (body.logoUrl.length > MAX_LOGO_BYTES) return badRequest("That image is too large — try something under ~400KB.");
    patch.logoUrl = body.logoUrl;
  }

  if (Object.keys(patch).length === 0) return badRequest("Nothing to update.");
  await db.update(organizations).set(patch).where(eq(organizations.id, user.orgId));
  return NextResponse.json({ ok: true });
}
