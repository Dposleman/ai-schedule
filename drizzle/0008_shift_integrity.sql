ALTER TABLE "attendance" ADD COLUMN "presence_status" text DEFAULT 'VERIFIED' NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "consecutive_presence_failures" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "last_heartbeat_at" timestamp;
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "last_verified_presence_at" timestamp;
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "first_suspicious_at" timestamp;
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "requires_review" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "attendance_integrity_events" ("id" text PRIMARY KEY NOT NULL, "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade, "attendance_id" text NOT NULL REFERENCES "attendance"("id") ON DELETE cascade, "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade, "type" text NOT NULL, "status" text NOT NULL, "distance_meters" integer, "accuracy_meters" integer, "metadata" text DEFAULT '{}' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE INDEX "attendance_integrity_events_attendance_created_idx" ON "attendance_integrity_events" ("attendance_id", "created_at");
