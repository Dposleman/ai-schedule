// Plan catalog — stable internal keys, never scattered UI strings. A route
// or component asks "what does 'growth' include?", never hardcodes a limit
// inline. Provider (Stripe) price IDs get mapped to these keys once billing
// is wired up (see lib/billing.ts) — the keys themselves never change even
// if pricing or the provider does.
//
// Prices are NOT finalized here on purpose (master prompt: "Do not finalize
// prices inside code without owner approval"). priceMonthlyCents is a
// placeholder for UI purposes only until the owner approves real pricing.
export type PlanKey = "starter" | "growth" | "pro";

export type Plan = {
  key: PlanKey;
  name: string;
  locationLimit: number; // Number.POSITIVE_INFINITY = "configurable/unlimited" (Pro)
  seatLimit: number;
  priceMonthlyCents: number | null; // null = "contact us" / not yet priced
  positioning: string;
};

export const PLAN_CATALOG: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    locationLimit: 1,
    seatLimit: 10,
    priceMonthlyCents: null,
    positioning: "Scheduling, availability, attendance, leave, basic coverage.",
  },
  growth: {
    key: "growth",
    name: "Growth",
    locationLimit: 3,
    seatLimit: 50,
    priceMonthlyCents: null,
    positioning: "Automation, advanced coverage, timesheets, labour controls.",
  },
  pro: {
    key: "pro",
    name: "Pro",
    // Master prompt: "Configurable" for Pro — no hard cap, sold per real
    // usage once billing is wired up. 9999 acts as "effectively unlimited"
    // for enforcement purposes without needing a separate null/Infinity
    // branch everywhere a limit is compared.
    locationLimit: 9999,
    seatLimit: 9999,
    priceMonthlyCents: null,
    positioning: "Multi-location, advanced scheduling, integrations, priority features.",
  },
};

export const DEFAULT_TRIAL_DAYS = 14;

export function getPlan(planKey: string): Plan {
  return PLAN_CATALOG[planKey as PlanKey] ?? PLAN_CATALOG.starter;
}
