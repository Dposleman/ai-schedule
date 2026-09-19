import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { newId } from "@/lib/auth";

// Keep this list to actions someone would plausibly need to trace later
// ("who approved this?", "who moved my shift?") — not every read, and not
// auth events (those already have their own trail via the sessions table).
export type AuditAction =
  | "employee.create"
  | "employee.update"
  | "employee.delete"
  | "location.create"
  | "location.update"
  | "location.delete"
  | "organization.update"
  | "permissions.update"
  | "absence.decide"
  | "transfer.create"
  | "transfer.complete"
  | "transfer.activate"
  | "shift.update"
  | "shift.delete"
  | "shift.publish"
  | "schedule.generate"
  | "coverage.accept";

// id is null for a system-triggered event (a cron job, not a logged-in
// user) — actorUserId is a nullable FK, so this avoids inserting a fake
// user id that would just fail the foreign key constraint.
type AuditActor = { id: string | null; name: string };

/**
 * Appends one row to the audit_events table. Never throws — a failure here
 * (a DB hiccup, a bug in the caller's metadata) must never take down the
 * actual request it's describing; worst case, that one entry is missing.
 */
export async function recordAuditEvent(
  orgId: string,
  actor: AuditActor,
  action: AuditAction,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
) {
  try {
    await db.insert(auditEvents).values({
      id: newId("audit"),
      orgId,
      actorUserId: actor.id,
      actorName: actor.name,
      action,
      entityType,
      entityId,
      metadata: JSON.stringify(metadata ?? {}),
    });
  } catch (err) {
    console.error("[audit] failed to record event", action, err);
  }
}
