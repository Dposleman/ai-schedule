import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest } from "@/lib/api";

/**
 * Parses and validates a JSON request body against a Zod schema in one
 * step. Every mutating route used to hand-roll its own `body?.field?.trim()`
 * checks (or skip them entirely) — this centralizes that so a malformed or
 * unexpected-shape body always gets a consistent 400 with a useful message
 * instead of either silently coercing bad input (`Number("abc") || 0`) or
 * crashing into withRoute's generic 500 (e.g. `body.name.trim()` when
 * `name` is a number).
 *
 * Returns `{ data, error: null }` on success or `{ data: null, error }` on
 * failure — a route just does:
 *   const { data, error } = await parseBody(request, mySchema);
 *   if (error) return error;
 */
export async function parseBody<Schema extends z.ZodTypeAny>(
  request: NextRequest,
  schema: Schema
): Promise<{ data: z.infer<Schema>; error: null } | { data: null; error: NextResponse }> {
  const json = await request.json().catch(() => null);
  const result = schema.safeParse(json);
  if (!result.success) {
    return { data: null, error: badRequest(firstIssueMessage(result.error)) };
  }
  return { data: result.data, error: null };
}

/** Same as parseBody, but for a URL's query string (e.g. ?from=...&to=...). */
export function parseQuery<Schema extends z.ZodTypeAny>(
  searchParams: URLSearchParams,
  schema: Schema
): { data: z.infer<Schema>; error: null } | { data: null; error: NextResponse } {
  const result = schema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) {
    return { data: null, error: badRequest(firstIssueMessage(result.error)) };
  }
  return { data: result.data, error: null };
}

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message || "Invalid request.";
}

// ---- Shared field-level schemas, matching the formats this app's own
// client always sends (native <input type="date">/"time"> and the AI
// scheduler both produce these exact shapes) ----

/** A non-empty id-shaped string, e.g. "user_abc123". IDs here are opaque —
 * this just guards against empty strings, arrays, and objects being passed
 * where the DB layer expects a plain string primary/foreign key. */
export const zId = z.string().trim().min(1, "Missing id.").max(64);

export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD.");

export const zTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a time as HH:MM.");

export const zEmail = z.string().trim().toLowerCase().email("Enter a valid email address.").max(320);

/** Trims and requires at least one non-whitespace character, capped so a
 * client can't stuff megabytes of text into a name/title field. */
export function zText(max = 200) {
  return z.string().trim().min(1, "This field is required.").max(max);
}

/** Like zText, but empty/missing is fine — coerced to "". */
export function zOptionalText(max = 500) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? "");
}

/** A money amount in the app's usual units (e.g. dollars), coerced from
 * whatever JSON type arrives and converted to integer cents. Rejects
 * negative amounts and non-numeric input instead of silently defaulting to
 * 0 the way `Math.round(Number(body.x) * 100) || 0` used to. */
export const zMoneyToCents = z.coerce
  .number({ error: "Expected a number." })
  .nonnegative("Must be zero or more.")
  .max(10_000_000)
  .transform((value) => Math.round(value * 100));

export const zDataUriImage = (maxBytes: number) =>
  z
    .string()
    .max(maxBytes, `That image is too large — try something under ~${Math.round((maxBytes * 0.75) / 1000)}KB.`)
    .refine((value) => /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(value), {
      message: "Logo must be an uploaded image.",
    });
