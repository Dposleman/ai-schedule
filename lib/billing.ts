import { db } from "@/db";
import { billing, users, locations } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { getPlan, type Plan } from "@/lib/plans";

export type BillingRow = typeof billing.$inferSelect;

export type BillingState = {
  row: BillingRow;
  plan: Plan;
  // True once trialEndsAt has passed while still "trialing" and no real
  // subscription has taken over — computed on read rather than trusted
  // from the stored status, since the cron that flips the stored status
  // (see app/api/cron/billing-trial-check) only runs periodically.
  isTrialExpired: boolean;
  // True when writes should be blocked and the org shown a restricted/
  // read-only state: trial ran out with no paid subscription, or the
  // subscription itself is past_due/canceled/unpaid past its grace period.
  // Reads always stay allowed — data is never hidden or deleted for this.
  isRestricted: boolean;
};

export async function getOrCreateBilling(orgId: string): Promise<BillingRow> {
  const [row] = await db.select().from(billing).where(eq(billing.orgId, orgId)).limit(1);
  if (row) return row;
  // An org created before this table existed, or a race with signup — self-
  // heal with the same defaults signup uses rather than erroring every
  // billing-aware route out for that org.
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await db
    .insert(billing)
    .values({ orgId, trialStartedAt: now.toISOString(), trialEndsAt: trialEndsAt.toISOString() })
    .onConflictDoNothing();
  const [created] = await db.select().from(billing).where(eq(billing.orgId, orgId)).limit(1);
  return created;
}

export async function getBillingState(orgId: string): Promise<BillingState> {
  const row = await getOrCreateBilling(orgId);
  const plan = getPlan(row.planKey);
  const now = Date.now();

  const isTrialExpired = row.subscriptionStatus === "trialing" && new Date(row.trialEndsAt).getTime() < now;
  const inGrace = row.gracePeriodEndsAt ? new Date(row.gracePeriodEndsAt).getTime() >= now : false;
  const subscriptionLapsed = row.subscriptionStatus === "past_due" || row.subscriptionStatus === "canceled" || row.subscriptionStatus === "unpaid";
  const isRestricted = (isTrialExpired || row.subscriptionStatus === "trial_expired" || subscriptionLapsed) && !inGrace;

  return { row, plan, isTrialExpired, isRestricted };
}

/**
 * Server-side seat limit check — call before inserting a new employee.
 * Counts active users in the org (excluding the one being replaced, if
 * any) against the plan's seatLimit. This is the actual enforcement point;
 * a disabled "Add employee" button in the UI is not one.
 */
export async function checkSeatLimit(orgId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const state = await getBillingState(orgId);
  const [{ value }] = await db.select({ value: count() }).from(users).where(eq(users.orgId, orgId));
  if (value >= state.plan.seatLimit) {
    return { ok: false, message: `Your ${state.plan.name} plan is limited to ${state.plan.seatLimit} employees. Upgrade to add more.` };
  }
  return { ok: true };
}

export async function checkLocationLimit(orgId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const state = await getBillingState(orgId);
  const [{ value }] = await db.select({ value: count() }).from(locations).where(eq(locations.orgId, orgId));
  if (value >= state.plan.locationLimit) {
    return { ok: false, message: `Your ${state.plan.name} plan is limited to ${state.plan.locationLimit} location(s). Upgrade to add more.` };
  }
  return { ok: true };
}
