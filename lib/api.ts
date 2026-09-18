import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  return { user, error: null as null };
}

export function requireRole(user: NonNullable<SessionUser>, roles: Array<"owner" | "manager" | "employee">) {
  if (!roles.includes(user.role as never)) {
    return NextResponse.json({ error: "You don't have permission for this action" }, { status: 403 });
  }
  return null;
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Wraps an API route handler so an unexpected error (a DB hiccup, a bug)
 * never crashes the request with a bare, unhandled 500 — it's logged
 * server-side (visible in Vercel's function logs) and the client gets a
 * plain, safe error message instead of a stack trace or a blank failure.
 */
export function withRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("[api] unhandled error", err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
