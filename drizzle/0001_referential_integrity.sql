-- Backfill unavailability.org_id from users before enforcing NOT NULL,
-- so this is safe to run against the live table that predates this column.
ALTER TABLE "unavailability" ADD COLUMN "org_id" text;
--> statement-breakpoint
UPDATE "unavailability" u SET "org_id" = usr."org_id" FROM "users" usr WHERE usr."id" = u."user_id" AND u."org_id" IS NULL;
--> statement-breakpoint
-- Rows whose user_id no longer resolves to any user (the user was deleted
-- some other way, outside a FK-enforced path that didn't exist before this
-- migration) can't be backfilled — they're already meaningless on their own
-- (an unavailability date for nobody), so we drop them rather than blocking
-- every other constraint in this migration on their account.
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count FROM "unavailability" WHERE "org_id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE WARNING 'Deleting % unavailability row(s) with no matching user before enforcing org_id NOT NULL.', orphan_count;
    DELETE FROM "unavailability" WHERE "org_id" IS NULL;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "unavailability" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
-- absence_requests.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "absence_requests" VALIDATE CONSTRAINT "absence_requests_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint absence_requests_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "absence_requests" VALIDATE CONSTRAINT "absence_requests_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- absence_requests.user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "absence_requests" VALIDATE CONSTRAINT "absence_requests_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint absence_requests_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "absence_requests" VALIDATE CONSTRAINT "absence_requests_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- attendance.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "attendance" VALIDATE CONSTRAINT "attendance_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint attendance_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "attendance" VALIDATE CONSTRAINT "attendance_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- attendance.shift_id -> shifts.id
DO $$ BEGIN
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "attendance" VALIDATE CONSTRAINT "attendance_shift_id_shifts_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint attendance_shift_id_shifts_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "attendance" VALIDATE CONSTRAINT "attendance_shift_id_shifts_id_fk";';
END $$;
--> statement-breakpoint
-- attendance.user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "attendance" VALIDATE CONSTRAINT "attendance_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint attendance_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "attendance" VALIDATE CONSTRAINT "attendance_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- coverage_candidates.request_id -> coverage_requests.id
DO $$ BEGIN
  ALTER TABLE "coverage_candidates" ADD CONSTRAINT "coverage_candidates_request_id_coverage_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coverage_requests"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "coverage_candidates" VALIDATE CONSTRAINT "coverage_candidates_request_id_coverage_requests_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint coverage_candidates_request_id_coverage_requests_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "coverage_candidates" VALIDATE CONSTRAINT "coverage_candidates_request_id_coverage_requests_id_fk";';
END $$;
--> statement-breakpoint
-- coverage_candidates.user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "coverage_candidates" ADD CONSTRAINT "coverage_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "coverage_candidates" VALIDATE CONSTRAINT "coverage_candidates_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint coverage_candidates_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "coverage_candidates" VALIDATE CONSTRAINT "coverage_candidates_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- coverage_requests.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "coverage_requests" VALIDATE CONSTRAINT "coverage_requests_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint coverage_requests_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "coverage_requests" VALIDATE CONSTRAINT "coverage_requests_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- coverage_requests.shift_id -> shifts.id
DO $$ BEGIN
  ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "coverage_requests" VALIDATE CONSTRAINT "coverage_requests_shift_id_shifts_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint coverage_requests_shift_id_shifts_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "coverage_requests" VALIDATE CONSTRAINT "coverage_requests_shift_id_shifts_id_fk";';
END $$;
--> statement-breakpoint
-- coverage_requests.accepted_by_user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "coverage_requests" VALIDATE CONSTRAINT "coverage_requests_accepted_by_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint coverage_requests_accepted_by_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "coverage_requests" VALIDATE CONSTRAINT "coverage_requests_accepted_by_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- daily_tasks.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "daily_tasks" VALIDATE CONSTRAINT "daily_tasks_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint daily_tasks_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "daily_tasks" VALIDATE CONSTRAINT "daily_tasks_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- daily_tasks.location_id -> locations.id
DO $$ BEGIN
  ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "daily_tasks" VALIDATE CONSTRAINT "daily_tasks_location_id_locations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint daily_tasks_location_id_locations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "daily_tasks" VALIDATE CONSTRAINT "daily_tasks_location_id_locations_id_fk";';
END $$;
--> statement-breakpoint
-- daily_tasks.owner_user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "daily_tasks" VALIDATE CONSTRAINT "daily_tasks_owner_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint daily_tasks_owner_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "daily_tasks" VALIDATE CONSTRAINT "daily_tasks_owner_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- locations.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "locations" ADD CONSTRAINT "locations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "locations" VALIDATE CONSTRAINT "locations_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint locations_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "locations" VALIDATE CONSTRAINT "locations_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- notifications.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint notifications_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- notifications.user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint notifications_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- password_reset_tokens.user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "password_reset_tokens" VALIDATE CONSTRAINT "password_reset_tokens_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint password_reset_tokens_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "password_reset_tokens" VALIDATE CONSTRAINT "password_reset_tokens_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- permissions.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "permissions" ADD CONSTRAINT "permissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "permissions" VALIDATE CONSTRAINT "permissions_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint permissions_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "permissions" VALIDATE CONSTRAINT "permissions_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- shifts.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "shifts" ADD CONSTRAINT "shifts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "shifts" VALIDATE CONSTRAINT "shifts_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint shifts_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "shifts" VALIDATE CONSTRAINT "shifts_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- shifts.location_id -> locations.id
DO $$ BEGIN
  ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "shifts" VALIDATE CONSTRAINT "shifts_location_id_locations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint shifts_location_id_locations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "shifts" VALIDATE CONSTRAINT "shifts_location_id_locations_id_fk";';
END $$;
--> statement-breakpoint
-- shifts.user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "shifts" VALIDATE CONSTRAINT "shifts_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint shifts_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "shifts" VALIDATE CONSTRAINT "shifts_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- transfers.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "transfers" ADD CONSTRAINT "transfers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "transfers" VALIDATE CONSTRAINT "transfers_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint transfers_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "transfers" VALIDATE CONSTRAINT "transfers_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- transfers.user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "transfers" VALIDATE CONSTRAINT "transfers_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint transfers_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "transfers" VALIDATE CONSTRAINT "transfers_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- transfers.from_location_id -> locations.id
DO $$ BEGIN
  ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "transfers" VALIDATE CONSTRAINT "transfers_from_location_id_locations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint transfers_from_location_id_locations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "transfers" VALIDATE CONSTRAINT "transfers_from_location_id_locations_id_fk";';
END $$;
--> statement-breakpoint
-- transfers.to_location_id -> locations.id
DO $$ BEGIN
  ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "transfers" VALIDATE CONSTRAINT "transfers_to_location_id_locations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint transfers_to_location_id_locations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "transfers" VALIDATE CONSTRAINT "transfers_to_location_id_locations_id_fk";';
END $$;
--> statement-breakpoint
-- unavailability.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "unavailability" VALIDATE CONSTRAINT "unavailability_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint unavailability_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "unavailability" VALIDATE CONSTRAINT "unavailability_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- unavailability.user_id -> users.id
DO $$ BEGIN
  ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "unavailability" VALIDATE CONSTRAINT "unavailability_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint unavailability_user_id_users_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "unavailability" VALIDATE CONSTRAINT "unavailability_user_id_users_id_fk";';
END $$;
--> statement-breakpoint
-- users.org_id -> organizations.id
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "users" VALIDATE CONSTRAINT "users_org_id_organizations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint users_org_id_organizations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "users" VALIDATE CONSTRAINT "users_org_id_organizations_id_fk";';
END $$;
--> statement-breakpoint
-- users.home_location_id -> locations.id
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_home_location_id_locations_id_fk" FOREIGN KEY ("home_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "users" VALIDATE CONSTRAINT "users_home_location_id_locations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint users_home_location_id_locations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "users" VALIDATE CONSTRAINT "users_home_location_id_locations_id_fk";';
END $$;
--> statement-breakpoint
-- users.current_location_id -> locations.id
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_current_location_id_locations_id_fk" FOREIGN KEY ("current_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "users" VALIDATE CONSTRAINT "users_current_location_id_locations_id_fk";
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Constraint users_current_location_id_locations_id_fk added but NOT fully validated - existing rows violate it. Clean up orphaned data, then run: ALTER TABLE "users" VALIDATE CONSTRAINT "users_current_location_id_locations_id_fk";';
END $$;
--> statement-breakpoint
-- Indexes already created by the legacy runtime bootstrap on production (kept here,
-- as IF NOT EXISTS, so a brand-new database created purely from migrations ends up
-- with the same indexes).
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_open_session_idx" ON "attendance" ("user_id") WHERE "check_out_at" IS NULL;
CREATE INDEX IF NOT EXISTS "users_org_id_idx" ON "users" ("org_id");
CREATE INDEX IF NOT EXISTS "shifts_org_id_date_idx" ON "shifts" ("org_id", "date");
CREATE INDEX IF NOT EXISTS "shifts_user_id_date_idx" ON "shifts" ("user_id", "date");
CREATE INDEX IF NOT EXISTS "absence_requests_org_id_idx" ON "absence_requests" ("org_id");
CREATE INDEX IF NOT EXISTS "unavailability_user_id_date_idx" ON "unavailability" ("user_id", "date");
CREATE INDEX IF NOT EXISTS "transfers_org_id_idx" ON "transfers" ("org_id");
CREATE INDEX IF NOT EXISTS "coverage_requests_org_id_idx" ON "coverage_requests" ("org_id");
CREATE INDEX IF NOT EXISTS "coverage_candidates_request_id_idx" ON "coverage_candidates" ("request_id");
CREATE INDEX IF NOT EXISTS "coverage_candidates_user_id_idx" ON "coverage_candidates" ("user_id");
CREATE INDEX IF NOT EXISTS "daily_tasks_org_id_date_idx" ON "daily_tasks" ("org_id", "date");
CREATE INDEX IF NOT EXISTS "attendance_user_id_idx" ON "attendance" ("user_id");
CREATE INDEX IF NOT EXISTS "attendance_org_id_idx" ON "attendance" ("org_id");

-- New: index every new FK column that didn't already have one above, so
-- ON DELETE cascade/restrict/set null checks and joins don't do seq scans.
CREATE INDEX IF NOT EXISTS "locations_org_id_idx" ON "locations" ("org_id");
CREATE INDEX IF NOT EXISTS "unavailability_org_id_idx" ON "unavailability" ("org_id");
CREATE INDEX IF NOT EXISTS "shifts_location_id_idx" ON "shifts" ("location_id");
CREATE INDEX IF NOT EXISTS "coverage_requests_shift_id_idx" ON "coverage_requests" ("shift_id");
CREATE INDEX IF NOT EXISTS "coverage_requests_accepted_by_user_id_idx" ON "coverage_requests" ("accepted_by_user_id");
CREATE INDEX IF NOT EXISTS "daily_tasks_location_id_idx" ON "daily_tasks" ("location_id");
CREATE INDEX IF NOT EXISTS "daily_tasks_owner_user_id_idx" ON "daily_tasks" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "attendance_shift_id_idx" ON "attendance" ("shift_id");
CREATE INDEX IF NOT EXISTS "transfers_user_id_idx" ON "transfers" ("user_id");
CREATE INDEX IF NOT EXISTS "transfers_from_location_id_idx" ON "transfers" ("from_location_id");
CREATE INDEX IF NOT EXISTS "transfers_to_location_id_idx" ON "transfers" ("to_location_id");
CREATE INDEX IF NOT EXISTS "users_home_location_id_idx" ON "users" ("home_location_id");
CREATE INDEX IF NOT EXISTS "users_current_location_id_idx" ON "users" ("current_location_id");
