import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/auth";

export type NotificationType =
  | "coverage_needed"
  | "coverage_invite"
  | "coverage_accepted"
  | "coverage_escalated"
  | "absence_requested"
  | "absence_decided";

export async function notify(params: {
  orgId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityId?: string;
}) {
  await db.insert(notifications).values({
    id: newId("notif"),
    orgId: params.orgId,
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? "",
    entityId: params.entityId ?? null,
  });
}

export async function notifyMany(
  userIds: string[],
  params: { orgId: string; type: NotificationType; title: string; body?: string; entityId?: string }
) {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;
  await db.insert(notifications).values(
    unique.map((userId) => ({
      id: newId("notif"),
      orgId: params.orgId,
      userId,
      type: params.type,
      title: params.title,
      body: params.body ?? "",
      entityId: params.entityId ?? null,
    }))
  );
}

// Owners and managers are the org's "who gets paged" audience — the data
// model doesn't scope managers to specific locations, so everyone with
// enough permission to act on a coverage gap or absence request sees it.
export async function managersOf(orgId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, orgId)));
  return rows.filter((row) => row.role === "owner" || row.role === "manager").map((row) => row.id);
}
