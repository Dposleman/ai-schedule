ALTER TABLE "attendance" ADD COLUMN "approved" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;