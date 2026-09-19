import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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


const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

let migrated: Promise<void> | null = null;

/**
 * Applies pending Drizzle migrations (see ./drizzle/*.sql) to the database,
 * lazily and once per warm instance — same call sites and same guarantee as
 * the old hand-written ensureSchema() this replaces (every request path that
 * touches the DB before a session exists calls this first).
 *
 * Production and any other database that was bootstrapped by the *old*
 * runtime ensureSchema() (raw CREATE TABLE IF NOT EXISTS on every cold
 * start, no migration history) already has every table 0000_baseline.sql
 * would create. Re-running that file against it would fail on "relation
 * already exists". So on first run against such a database we adopt it:
 * we record 0000_baseline as already applied (matching its actual state)
 * without executing it, then let the normal migrator run only what's
 * genuinely new (0001+). A brand-new database has none of these tables yet,
 * so it just runs every migration from 0000 forward, same as any fresh
 * Drizzle project.
 */
export async function ensureSchema() {
  if (!migrated) migrated = runMigrations();
  return migrated;
}

async function runMigrations() {
  const pool = getPool();

  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const { rows: tracked } = await pool.query(
    `SELECT 1 FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" LIMIT 1`
  );
  if (tracked.length === 0) {
    const { rows: existingTables } = await pool.query(`SELECT to_regclass('public.organizations') AS reg`);
    const isPreExistingDatabase = existingTables[0]?.reg !== null;
    if (isPreExistingDatabase) {
      const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf-8"));
      const baselineEntry = journal.entries[0];
      const baselineSql = fs.readFileSync(path.join(MIGRATIONS_FOLDER, `${baselineEntry.tag}.sql`), "utf-8");
      const hash = crypto.createHash("sha256").update(baselineSql).digest("hex");
      await pool.query(
        `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2)`,
        [hash, baselineEntry.when]
      );
    }
  }

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: MIGRATIONS_SCHEMA, migrationsTable: MIGRATIONS_TABLE });
}
