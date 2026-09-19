ALTER TABLE "locations" ADD COLUMN "verified" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "activated_at" timestamp;--> statement-breakpoint
-- Backfill: a location whose coordinates aren't still the Copenhagen
-- placeholder default was already configured with a real pin before this
-- column existed — treat it as already verified so existing GPS check-in
-- doesn't suddenly start failing. Only a genuinely still-default location
-- starts unverified and requires a manager to confirm it.
UPDATE "locations" SET "verified" = 1 WHERE "latitude" <> 55.6761 OR "longitude" <> 12.5683;--> statement-breakpoint
-- Backfill: every transfer created before this column existed already had
-- its location change applied immediately (the old, unconditional
-- behavior) — mark them all activated so the new activation cron never
-- tries to "catch up" on old data.
UPDATE "transfers" SET "activated_at" = "created_at" WHERE "activated_at" IS NULL;