import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireCapability, badRequest, notFound, withRoute } from "@/lib/api";
import { parseBody, zDataUriImage } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";

// Logos are stored as data: URIs directly on the row — small enough (capped
// below) that this beats standing up object storage just for this, and
// keeps upload/download a single request with no extra infra to configure.
const MAX_LOGO_BYTES = 600_000;

const patchOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    logoUrl: z.union([zDataUriImage(MAX_LOGO_BYTES), z.null()]).optional(),
    payPeriodStartDay: z.coerce.number().int().min(1).max(28).optional(),
  })
  .refine((body) => body.name !== undefined || body.logoUrl !== undefined || body.payPeriodStartDay !== undefined, {
    message: "Nothing to update.",
  });

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId)).limit(1);
  if (!org) return notFound("Organization not found.");
  return NextResponse.json({ organization: org });
});

export const PATCH = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "organization.manage");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, patchOrganizationSchema);
  if (validationError) return validationError;

  const patch: Partial<typeof organizations.$inferInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.logoUrl !== undefined) patch.logoUrl = data.logoUrl;
  if (data.payPeriodStartDay !== undefined) patch.payPeriodStartDay = data.payPeriodStartDay;
  if (Object.keys(patch).length === 0) return badRequest("Nothing to update.");

  await db.update(organizations).set(patch).where(eq(organizations.id, user.orgId));
  await recordAuditEvent(user.orgId, { id: user.id, name: user.name }, "organization.update", "organization", user.orgId, {
    name: data.name,
    logoUrlChanged: data.logoUrl !== undefined,
    payPeriodStartDay: data.payPeriodStartDay,
  });
  return NextResponse.json({ ok: true });
});
