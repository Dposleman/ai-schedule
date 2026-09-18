import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __aiSchedulePool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __aiScheduleDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

// Lazy: the pool/connection is only created the first time a query actually
// runs, not at module import time. This avoids crashing `next build` (which
// imports every route module to collect its metadata) when DATABASE_URL
// isn't set yet at build time.
function getPool() {
  if (globalThis.__aiSchedulePool) return globalThis.__aiSchedulePool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta la variable de entorno DATABASE_URL. Define la cadena de conexión a tu base de datos Postgres (Neon, Vercel Postgres, Supabase, etc.)."
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 1 : 10,
  });
  globalThis.__aiSchedulePool = pool;
  return pool;
}

function getDb() {
  if (!globalThis.__aiScheduleDb) {
    globalThis.__aiScheduleDb = drizzle(getPool(), { schema });
  }
  return globalThis.__aiScheduleDb;
}

// Proxy so existing call sites (`db.select()...`) keep working unchanged,
// while the real connection is only made lazily on first use.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

let migrated = false;
export async function ensureSchema() {
  if (migrated) return;
  migrated = true;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo_url TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      open_hours TEXT NOT NULL DEFAULT '08:00–23:00',
      latitude DOUBLE PRECISION NOT NULL DEFAULT 55.6761,
      longitude DOUBLE PRECISION NOT NULL DEFAULT 12.5683,
      radius_meters INTEGER NOT NULL DEFAULT 50,
      budget_cents INTEGER NOT NULL DEFAULT 0,
      logo_url TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS logo_url TEXT;

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
      language TEXT NOT NULL DEFAULT 'en',
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

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
      created_at TIMESTAMP NOT NULL DEFAULT now()
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
      created_at TIMESTAMP NOT NULL DEFAULT now()
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
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS coverage_requests (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      shift_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      accepted_by_user_id TEXT,
      escalated INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    ALTER TABLE coverage_requests ADD COLUMN IF NOT EXISTS escalated INTEGER NOT NULL DEFAULT 0;

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
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      entity_id TEXT,
      read_at TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);

    CREATE TABLE IF NOT EXISTS permissions (
      org_id TEXT PRIMARY KEY,
      approve_leave INTEGER NOT NULL DEFAULT 1,
      move_employees INTEGER NOT NULL DEFAULT 1,
      edit_published INTEGER NOT NULL DEFAULT 1,
      override_ai INTEGER NOT NULL DEFAULT 0
    );
  `);
}
