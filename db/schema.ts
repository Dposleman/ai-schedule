import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  openHours: text("open_hours").notNull().default("08:00–23:00"),
  latitude: real("latitude").notNull().default(55.6761),
  longitude: real("longitude").notNull().default(12.5683),
  radiusMeters: integer("radius_meters").notNull().default(50),
  budgetCents: integer("budget_cents").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// role: owner | manager | employee
export const users = sqliteTable("users", {
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
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// status: scheduled | open | completed
export const shifts = sqliteTable("shifts", {
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
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// type: vacation | sick | unavailable
// status: pending | approved | rejected
export const absenceRequests = sqliteTable("absence_requests", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull().default("vacation"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const unavailability = sqliteTable("unavailability", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
});

// type: temporary | permanent, status: active | completed
export const transfers = sqliteTable("transfers", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  fromLocationId: text("from_location_id").notNull(),
  toLocationId: text("to_location_id").notNull(),
  type: text("type").notNull().default("temporary"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// status: open | closed
export const coverageRequests = sqliteTable("coverage_requests", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  shiftId: text("shift_id").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("open"),
  acceptedByUserId: text("accepted_by_user_id"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const coverageCandidates = sqliteTable("coverage_candidates", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  userId: text("user_id").notNull(),
  matchScore: integer("match_score").notNull().default(90),
  status: text("status").notNull().default("invited"),
});

export const dailyTasks = sqliteTable("daily_tasks", {
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

export const attendance = sqliteTable("attendance", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  shiftId: text("shift_id"),
  userId: text("user_id").notNull(),
  checkInAt: text("check_in_at"),
  checkOutAt: text("check_out_at"),
  autoCheckout: integer("auto_checkout").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const permissions = sqliteTable("permissions", {
  orgId: text("org_id").primaryKey(),
  approveLeave: integer("approve_leave").notNull().default(1),
  moveEmployees: integer("move_employees").notNull().default(1),
  editPublished: integer("edit_published").notNull().default(1),
  overrideAI: integer("override_ai").notNull().default(0),
});
