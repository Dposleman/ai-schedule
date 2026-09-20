ALTER TABLE "organizations" ADD COLUMN "pay_period_start_day" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_hour_target" integer DEFAULT 0 NOT NULL;
