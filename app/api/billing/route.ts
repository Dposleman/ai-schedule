import { NextResponse } from "next/server";
import { requireUser, requireCapability, withRoute } from "@/lib/api";
import { getBillingState } from "@/lib/billing";
import { PLAN_CATALOG } from "@/lib/plans";

// Read-only for now — there's no checkout/portal/webhook wiring yet (Phase
// 5 architecture step only, see lib/billing.ts). This exists so a future
// Settings > Billing screen has something real to read: current plan,
// trial/subscription status, and whether the org is in a restricted state.
export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  const permissionError = await requireCapability(user, "billing.manage");
  if (permissionError) return permissionError;

  const state = await getBillingState(user.orgId);
  return NextResponse.json({
    planKey: state.row.planKey,
    subscriptionStatus: state.row.subscriptionStatus,
    trialEndsAt: state.row.trialEndsAt,
    currentPeriodEnd: state.row.currentPeriodEnd,
    cancelAtPeriodEnd: state.row.cancelAtPeriodEnd === 1,
    gracePeriodEndsAt: state.row.gracePeriodEndsAt,
    seatLimit: state.row.seatLimit,
    locationLimit: state.row.locationLimit,
    isTrialExpired: state.isTrialExpired,
    isRestricted: state.isRestricted,
    plan: state.plan,
    catalog: Object.values(PLAN_CATALOG),
  });
});
