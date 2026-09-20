CREATE TABLE "attendance_breaks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"attendance_id" text NOT NULL,
	"user_id" text NOT NULL,
	"start_at" text NOT NULL,
	"end_at" text
);
--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;