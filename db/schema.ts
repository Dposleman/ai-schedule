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
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  openHours: text("open_hours").notNull().default("08:00–23:00"),
  latitude: doublePrecision("latitude").notNull().default(55.6761),
  longitude: doublePrecision("longitude").notNull().default(12.5683),
  radiusMeters: integer("radius_meters").notNull().default(50),
  budgetCents: integer("budget_cents").notNull().default(0),
  // Data URI, optional — falls back to the org logo when unset.
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// role: owner | manager | employee
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("employee"),
  occupation: text("occupation").notNull().default(""),
  phone: text("phone").notNull().default(""),
  color: text("color").notNull().default("blue"),
  homeLocationId: text("home_location_id"),
  currentLocationId: text("current_location_id"),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  weeklyHourTarget: integer("weekly_hour_target").notNull().default(0),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// status: scheduled | open | completed
export const shifts = pgTable("shifts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  locationId: text("location_id").notNull(),
  userId: text("user_id"),
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
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull().default("vacation"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const unavailability = pgTable("unavailability", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
});

// type: temporary | permanent, status: active | completed
export const transfers = pgTable("transfers", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  fromLocationId: text("from_location_id").notNull(),
  toLocationId: text("to_location_id").notNull(),
  type: text("type").notNull().default("temporary"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// status: open | closed
export const coverageRequests = pgTable("coverage_requests", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  shiftId: text("shift_id").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("open"),
  acceptedByUserId: text("accepted_by_user_id"),
  // 1 once the hour-with-no-response escalation has fired for this request,
  // so the cron job (and the manager's notification) only fires once.
  escalated: integer("escalated").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const coverageCandidates = pgTable("coverage_candidates", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  userId: text("user_id").notNull(),
  matchScore: integer("match_score").notNull().default(90),
  status: text("status").notNull().default("invited"),
});

export const dailyTasks = pgTable("daily_tasks", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  locationId: text("location_id").notNull(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id"),
  dueTime: text("due_time").notNull().default("09:00"),
  date: text("date").notNull(),
  automatic: integer("automatic").notNull().default(0),
  completed: integer("completed").notNull().default(0),
});

export const attendance = pgTable("attendance", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  shiftId: text("shift_id"),
  userId: text("user_id").notNull(),
  checkInAt: text("check_in_at"),
  checkOutAt: text("check_out_at"),
  autoCheckout: integer("auto_checkout").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

// type: coverage_invite | coverage_needed | coverage_accepted | coverage_escalated | absence_requested | absence_decided
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
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
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),
  usedAt: timestamp("used_at", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  orgId: text("org_id").primaryKey(),
  approveLeave: integer("approve_leave").notNull().default(1),
  moveEmployees: integer("move_employees").notNull().default(1),
  editPublished: integer("edit_published").notNull().default(1),
  overrideAI: integer("override_ai").notNull().default(0),
});
