CREATE TABLE "billing" (
	"org_id" text PRIMARY KEY NOT NULL,
	"plan_key" text DEFAULT 'starter' NOT NULL,
	"subscription_status" text DEFAULT 'trialing' NOT NULL,
	"trial_started_at" timestamp DEFAULT now() NOT NULL,
	"trial_ends_at" timestamp DEFAULT now() NOT NULL,
	"billing_customer_id" text,
	"billing_subscription_id" text,
	"current_period_end" timestamp,
	"cancel_at_period_end" integer DEFAULT 0 NOT NULL,
	"grace_period_ends_at" timestamp,
	"seat_limit" integer DEFAULT 10 NOT NULL,
	"location_limit" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing" ADD CONSTRAINT "billing_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Backfill: every org that already existed before billing was introduced is
-- already a real, operating customer — it must not suddenly be treated as a
-- fresh trial (which would start counting down to a restricted state) or be
-- blocked from creating employees/locations by the new default limits.
-- Give each one an "active" row with generous limits instead, exactly like
-- the 0004 migration backfilled locations.verified/transfers.activatedAt
-- for the same reason. Real limits get set later, per plan, once billing
-- is actually wired up to Stripe and an owner picks/pays for a plan.
INSERT INTO "billing" ("org_id", "plan_key", "subscription_status", "trial_started_at", "trial_ends_at", "seat_limit", "location_limit")
SELECT "id", 'pro', 'active', "created_at", "created_at", 9999, 9999
FROM "organizations"
WHERE "id" NOT IN (SELECT "org_id" FROM "billing");