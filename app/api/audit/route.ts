import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { requireUser, requireCapability, withRoute } from "@/lib/api";
import { parseQuery, zDate } from "@/lib/validation";
import { z } from "zod";

const listAuditQuerySchema = z.object({
  before: zDate.optional(), // paginate: entries strictly before this date
});

const PAGE_SIZE = 100;

export const GET = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "audit.view");
  if (permissionError) return permissionError;

  const { searchParams } = new URL(request.url);
  const { data, error: validationError } = parseQuery(searchParams, listAuditQuerySchema);
  if (validationError) return validationError;

  const conditions = [eq(auditEvents.orgId, user.orgId)];
  if (data.before) conditions.push(lt(auditEvents.createdAt, data.before));

  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(PAGE_SIZE);

  const events = rows.map((row) => ({
    ...row,
    metadata: safeParseMetadata(row.metadata),
  }));

  return NextResponse.json({ events });
});

function safeParseMetadata(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
