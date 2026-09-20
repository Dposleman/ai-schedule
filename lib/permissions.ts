import { db } from "@/db";
import { permissions as permissionsTable } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Every capability a request handler can gate on. This is deliberately a
 * flat list of concrete actions, not a role name — a route asks "can this
 * user schedule.publish?", never "is this user a manager?", so the actual
 * rule (who gets what) lives in exactly one place (below) instead of being
 * re-decided ad hoc in every route file.
 */
export type Capability =
  | "organization.manage"
  | "locations.manage"
  | "locations.delete"
  | "employees.manage"
  | "employees.delete"
  | "employees.transfer"
  | "schedule.edit"
  | "schedule.generate"
  | "schedule.publish"
  | "schedule.edit_published"
  | "schedule.override_ai"
  | "absences.approve"
  | "attendance.manage"
  | "coverage.manage"
  | "tasks.manage"
  | "permissions.manage"
  | "audit.view"
  | "billing.manage";

export type OrgPermissions = {
  approveLeave: number;
  moveEmployees: number;
  editPublished: number;
  overrideAI: number;
};

// Capabilities only the org's owner ever has, regardless of the org's
// configurable permissions row.
// audit.view is here rather than in MANAGER_BASE deliberately: the audit
// log's whole point is accountability for what managers themselves did, so
// it isn't something a manager can grant themselves access to.
// billing.manage is owner-only per the master prompt ("Billing management
// limited to owner or explicit billing-admin capability") — there's no
// separate billing-admin role in this app yet, so owner-only is the safe
// default until one is introduced.
const OWNER_ONLY = new Set<Capability>(["locations.delete", "permissions.manage", "audit.view", "billing.manage"]);

// Capabilities a manager has unconditionally — not gated by the org's
// configurable toggles below.
const MANAGER_BASE = new Set<Capability>([
  "organization.manage",
  "locations.manage",
  "employees.manage",
  "employees.delete",
  "schedule.edit",
  "schedule.generate",
  "schedule.publish",
  "schedule.edit_published",
  "schedule.override_ai",
  "coverage.manage",
  "tasks.manage",
  "attendance.manage",
]);

// Capabilities a manager only has when the org's owner has enabled the
// matching toggle (db/schema.ts `permissions` table, edited from
// Settings > Permissions — previously stored but never actually enforced
// anywhere; this is what makes those toggles do something).
const MANAGER_CONFIGURABLE: Record<Capability, keyof OrgPermissions> = {
  "absences.approve": "approveLeave",
  "employees.transfer": "moveEmployees",
  "schedule.edit_published": "editPublished",
  "schedule.override_ai": "overrideAI",
} as Partial<Record<Capability, keyof OrgPermissions>> as Record<Capability, keyof OrgPermissions>;

/**
 * Pure capability check. `orgPermissions` is only consulted for the
 * configurable capabilities above — pass it (or omit it, if the caller
 * already knows it isn't needed) for those; owners and employees never
 * need it.
 */
export function hasCapability(user: { role: string }, capability: Capability, orgPermissions?: OrgPermissions | null): boolean {
  if (user.role === "owner") return true;
  if (user.role !== "manager") return false;
  if (OWNER_ONLY.has(capability)) return false;
  if (MANAGER_BASE.has(capability)) return true;
  const toggleKey = MANAGER_CONFIGURABLE[capability];
  if (toggleKey) return orgPermissions ? orgPermissions[toggleKey] === 1 : false;
  return false;
}

export async function getOrgPermissions(orgId: string): Promise<OrgPermissions | null> {
  const [row] = await db.select().from(permissionsTable).where(eq(permissionsTable.orgId, orgId)).limit(1);
  return row ?? null;
}
