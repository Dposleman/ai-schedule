import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { permissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireCapability, withRoute } from "@/lib/api";
import { parseBody } from "@/lib/validation";

export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const [row] = await db.select().from(permissions).where(eq(permissions.orgId, user.orgId)).limit(1);
  return NextResponse.json({ permissions: row ?? null });
});

const patchPermissionsSchema = z.object({
  approveLeave: z.boolean().optional(),
  moveEmployees: z.boolean().optional(),
  editPublished: z.boolean().optional(),
  overrideAI: z.boolean().optional(),
});

export const PATCH = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "permissions.manage");
  if (permissionError) return permissionError;

  const { data, error: validationError } = await parseBody(request, patchPermissionsSchema);
  if (validationError) return validationError;

  const patch: Partial<typeof permissions.$inferInsert> = {};
  for (const key of ["approveLeave", "moveEmployees", "editPublished", "overrideAI"] as const) {
    if (typeof data[key] === "boolean") patch[key] = data[key] ? 1 : 0;
  }

  await db.update(permissions).set(patch).where(eq(permissions.orgId, user.orgId));
  return NextResponse.json({ ok: true });
});
