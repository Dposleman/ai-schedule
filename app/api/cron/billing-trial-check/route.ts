import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { billing } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { withRoute } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit";

// Same fail-closed pattern as the other cron endpoints.
function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !process.env.VERCEL;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Flips a lapsed trial's stored status from "trialing" to "trial_expired"
// once trialEndsAt has passed. lib/billing.ts's getBillingState() already
// computes this live on every read (isTrialExpired), so nothing is
// insecure between cron runs — this just keeps the stored status honest
// for anything that reads it directly (audit trail, a future billing UI
// listing orgs by status) and is the hook point for actually restricting
// access once billing-gated write checks are added on top of
// lib/billing.ts's isRestricted flag.
//
// Never deletes or restricts data by itself — no Stripe subscription
// exists yet for any org, so this is purely bookkeeping until Phase 5's
// checkout/webhooks are wired up.
export const GET = withRoute(async (request: NextRequest) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const now = new Date().toISOString();
  const expired = await db
    .select()
    .from(billing)
    .where(and(eq(billing.subscriptionStatus, "trialing"), lt(billing.trialEndsAt, now)));

  for (const row of expired) {
    await db.update(billing).set({ subscriptionStatus: "trial_expired", updatedAt: new Date().toISOString() }).where(eq(billing.orgId, row.orgId));
    await recordAuditEvent(row.orgId, { id: null, name: "Trial expiration check" }, "billing.trial_expire", "billing", row.orgId, {
      planKey: row.planKey,
      trialEndsAt: row.trialEndsAt,
    });
  }

  return NextResponse.json({ ok: true, expired: expired.length });
});
