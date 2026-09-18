import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "ai-schedule.db");

declare global {
  // eslint-disable-next-line no-var
  var __aiScheduleSqlite: Database.Database | undefined;
}

const sqlite = globalThis.__aiScheduleSqlite ?? new Database(dbPath);
if (!globalThis.__aiScheduleSqlite) globalThis.__aiScheduleSqlite = sqlite;
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  open_hours TEXT NOT NULL DEFAULT '08:00–23:00',
  latitude REAL NOT NULL DEFAULT 55.6761,
  longitude REAL NOT NULL DEFAULT 12.5683,
  radius_meters INTEGER NOT NULL DEFAULT 50,
  budget_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  occupation TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'blue',
  home_location_id TEXT,
  current_location_id TEXT,
  hourly_rate_cents INTEGER NOT NULL DEFAULT 0,
  weekly_hour_target INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  user_id TEXT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  ai_generated INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE IF NOT EXISTS absence_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'vacation',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE IF NOT EXISTS unavailability (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  from_location_id TEXT NOT NULL,
  to_location_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'temporary',
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE IF NOT EXISTS coverage_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  accepted_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE IF NOT EXISTS coverage_candidates (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  match_score INTEGER NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'invited'
);

CREATE TABLE IF NOT EXISTS daily_tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_user_id TEXT,
  due_time TEXT NOT NULL DEFAULT '09:00',
  date TEXT NOT NULL,
  automatic INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  shift_id TEXT,
  user_id TEXT NOT NULL,
  check_in_at TEXT,
  check_out_at TEXT,
  auto_checkout INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE IF NOT EXISTS permissions (
  org_id TEXT PRIMARY KEY,
  approve_leave INTEGER NOT NULL DEFAULT 1,
  move_employees INTEGER NOT NULL DEFAULT 1,
  edit_published INTEGER NOT NULL DEFAULT 1,
  override_ai INTEGER NOT NULL DEFAULT 0
);
`);

export const db = drizzle(sqlite, { schema });
export { sqlite };
