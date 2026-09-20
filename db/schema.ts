import { pgTable, text, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Data URI (small PNG/JPG/SVG, capped client + server side) — optional, shown small in the sidebar.
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  openHours: text("open_hours").notNull().default("08:00–23:00"),
  latitude: doublePrecision("latitude").notNull().default(55.6761),
  longitude: doublePrecision("longitude").notNull().default(12.5683),
  radiusMeters: integer("radius_meters").notNull().default(50),
  budgetCents: integer("budget_cents").notNull().default(0),
  // A newly created location defaults to Copenhagen coordinates (see the
  // POST handler) until a manager confirms the real address/pin — 0 until
  // then. GPS clock-in is refused for an unverified location so nobody can
  // accidentally clock in against a placeholder location on the other side
  // of the world. Set to 1 whenever latitude/longitude/radiusMeters are
  // explicitly written via PATCH.
  verified: integer("verified").notNull().default(0),
  // Data URI, optional — falls back to the org logo when unset.
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// role: owner | manager | employee
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("employee"),
  occupation: text("occupation").notNull().default(""),
  phone: text("phone").notNull().default(""),
  color: text("color").notNull().default("blue"),
  homeLocationId: text("home_location_id").references(() => locations.id, { onDelete: "set null" }),
  currentLocationId: text("current_location_id").references(() => locations.id, { onDelete: "set null" }),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  weeklyHourTarget: integer("weekly_hour_target").notNull().default(0),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// status: scheduled | open | completed
export const shifts = pgTable("shifts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "restrict" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  date: text("date").notNull(), // ISO yyyy-mm-dd
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(), // HH:MM
  role: text("role").notNull().default(""),
  status: text("status").notNull().default("scheduled"),
  aiGenerated: integer("ai_generated").notNull().default(0),
  published: integer("published").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// type: vacation | sick | unavailable
// status: pending | approved | rejected
export const absenceRequests = pgTable("absence_requests", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("vacation"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const unavailability = pgTable("unavailability", {
  id: text("id").primaryKey(),
  // Backfilled from users.org_id in migration 0001 for tenants that predate
  // this column — see drizzle/0001_referential_integrity.sql.
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
});

// type: temporary | permanent, status: active | completed
export const transfers = pgTable("transfers", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fromLocationId: text("from_location_id").notNull().references(() => locations.id, { onDelete: "restrict" }),
  toLocationId: text("to_location_id").notNull().references(() => locations.id, { onDelete: "restrict" }),
  type: text("type").notNull().default("temporary"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull().default("active"),
  // Set once the employee's currentLocationId has actually been moved to
  // toLocationId — immediately at creation for a same-day/past startDate,
  // or later by the transfer-activation cron once a future startDate
  // arrives. Null means the move is still pending.
  activatedAt: timestamp("activated_at", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// status: open | closed
export const coverageRequests = pgTable("coverage_requests", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  shiftId: text("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("open"),
  acceptedByUserId: text("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  // 1 once the hour-with-no-response escalation has fired for this request,
  // so the cron job (and the manager's notification) only fires once.
  escalated: integer("escalated").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const coverageCandidates = pgTable("coverage_candidates", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => coverageRequests.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  matchScore: integer("match_score").notNull().default(90),
  status: text("status").notNull().default("invited"),
});

export const dailyTasks = pgTable("daily_tasks", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  dueTime: text("due_time").notNull().default("09:00"),
  date: text("date").notNull(),
  automatic: integer("automatic").notNull().default(0),
  completed: integer("completed").notNull().default(0),
});

export const attendance = pgTable("attendance", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  shiftId: text("shift_id").references(() => shifts.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  checkInAt: text("check_in_at"),
  checkOutAt: text("check_out_at"),
  autoCheckout: integer("auto_checkout").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  // Manager timesheet review (master prompt 11.4): a record starts
  // unapproved; a manager/owner reviews scheduled-vs-actual and either
  // approves it as-is or corrects checkInAt/checkOutAt first (both actions
  // go through PATCH /api/attendance/[id] and are audited). approvedBy is
  // set to null, not left stale, if the record is corrected again later.
  approved: integer("approved").notNull().default(0),
  approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { mode: "string" }),
});

// type: coverage_invite | coverage_needed | coverage_accepted | coverage_escalated | absence_requested | absence_decided
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("info"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  // Free-form pointer to whatever this notification is about (a coverage
  // request id, an absence id...) so the UI can deep-link to it.
  entityId: text("entity_id"),
  readAt: text("read_at"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// Short-lived, single-use tokens for "forgot password" — we only ever store
// a hash of the token (like a password), never the token itself, so a DB
// leak can't be used to reset anyone's password.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),
  usedAt: timestamp("used_at", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// Server-side session records — what makes a session revocable. The cookie
// only ever holds a high-entropy random token; only its hash is stored here
// (same reasoning as passwordResetTokens above), and a session with no
// matching non-revoked, non-expired row here is simply not logged in
// anymore, even if the browser still has the cookie.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  userAgent: text("user_agent").notNull().default(""),
  ipAddress: text("ip_address").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),
  revokedAt: timestamp("revoked_at", { mode: "string" }),
});

// Append-only log of who did what to the org's data, and when — shift
// reassignments, employee/location changes, absence decisions, permission
// changes. Nothing in the app ever updates or deletes a row here; it exists
// purely for traceability and disputes ("who approved this?", "who moved
// my shift?"). actorName is a snapshot taken at write time (in addition to
// the actorUserId FK) so an entry still reads sensibly after the actor
// themselves is later deleted from the org.
export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull().default(""),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull().default(""),
  // Small free-form JSON-encoded context (e.g. {"name":"...", "from":"...", "to":"..."}) — not a full diff, just enough to explain the entry without a second lookup.
  metadata: text("metadata").notNull().default("{}"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  orgId: text("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  approveLeave: integer("approve_leave").notNull().default(1),
  moveEmployees: integer("move_employees").notNull().default(1),
  editPublished: integer("edit_published").notNull().default(1),
  overrideAI: integer("override_ai").notNull().default(0),
});

// One row per organization, created at signup alongside `permissions`.
// planKey/subscriptionStatus are server-authoritative — nothing in the UI
// ever grants access on its own; a route checks this table (via
// lib/billing.ts) before allowing a paid feature or a limited create.
// No Stripe wiring yet (Phase 5 architecture step): billingCustomerId /
// billingSubscriptionId / currentPeriodEnd / cancelAtPeriodEnd stay null
// until checkout+webhooks are implemented, at which point they start
// getting written from verified Stripe events — never from a client
// request or a success-redirect.
export const billing = pgTable("billing", {
  orgId: text("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  // Stable internal plan key (see lib/plans.ts) — never a raw provider
  // product/price id, so pricing/provider can change without touching
  // every row or every entitlement check.
  planKey: text("plan_key").notNull().default("starter"),
  // trialing | active | past_due | canceled | unpaid | trial_expired
  subscriptionStatus: text("subscription_status").notNull().default("trialing"),
  trialStartedAt: timestamp("trial_started_at", { mode: "string" }).notNull().defaultNow(),
  trialEndsAt: timestamp("trial_ends_at", { mode: "string" }).notNull().defaultNow(),
  billingCustomerId: text("billing_customer_id"),
  billingSubscriptionId: text("billing_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end", { mode: "string" }),
  cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
  // Set when a trial/subscription lapses instead of deleting anything —
  // the org's data stays intact and readable, writes get gated off (see
  // lib/billing.ts isRestricted) until payment resumes.
  gracePeriodEndsAt: timestamp("grace_period_ends_at", { mode: "string" }),
  seatLimit: integer("seat_limit").notNull().default(10),
  locationLimit: integer("location_limit").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});
