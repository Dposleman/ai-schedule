// Kept separate from lib/auth.ts so middleware (Edge runtime) can read the
// cookie name without pulling in Node-only dependencies like better-sqlite3
// or bcryptjs.
export const SESSION_COOKIE_NAME = "ai_schedule_session";
