import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Origins the mobile app (Capacitor) can be served from. Android's default
// scheme is https://localhost; a few older/alternate setups use
// capacitor://localhost or ionic://localhost, and Capacitor's own local dev
// server (`cap run --livereload`) can use a LAN http origin — that one isn't
// listed here since dev builds should point at a local API instead. An extra
// allowlist can be supplied via ALLOWED_MOBILE_ORIGINS (comma-separated) for
// anything unusual without a redeploy of this file.
const DEFAULT_MOBILE_ORIGINS = ["https://localhost", "capacitor://localhost", "ionic://localhost"];
const EXTRA_MOBILE_ORIGINS = (process.env.ALLOWED_MOBILE_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_MOBILE_ORIGINS = new Set([...DEFAULT_MOBILE_ORIGINS, ...EXTRA_MOBILE_ORIGINS]);

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = new Headers();
  if (origin && ALLOWED_MOBILE_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
  }
  return headers;
}

// The session cookie has to be SameSite=None in production (see
// lib/auth.ts) so the mobile app can send it cross-origin — which also
// means the browser's own SameSite defense against CSRF does nothing here.
// This is the substitute for browser-authenticated requests: a
// state-changing request's own Origin (falling back to Referer) has to be
// either this site itself or one of the same mobile origins already
// allowlisted for CORS above. A request with neither header is left alone —
// blocking it would risk breaking non-browser callers (the cron job, for
// instance) that have no reason to ever send one, and forging a
// same-origin-looking request without the browser's cooperation isn't the
// attack this defends against.
function isTrustedOrigin(origin: string, appUrl: string) {
  if (ALLOWED_MOBILE_ORIGINS.has(origin)) return true;
  if (!appUrl) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

function checkCsrf(request: NextRequest): NextResponse | null {
  if (!MUTATING_METHODS.has(request.method)) return null;
  const origin = request.headers.get("origin") || tryOriginFromReferer(request.headers.get("referer"));
  if (!origin) return null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  if (!isTrustedOrigin(origin, appUrl)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  return null;
}

function tryOriginFromReferer(referer: string | null): string {
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function buildCsp() {
  // A stricter, nonce-based script-src (blocking 'unsafe-inline' entirely)
  // was tried and reverted: Next's RSC hydration payload ships as inline
  // <script> tags with no nonce attribute attached (verified by inspecting
  // the actual rendered output — its nonce came back "$undefined" even
  // though the documented request-header handoff from middleware was
  // followed exactly), so a strict policy blocked the app's own bootstrap
  // scripts. 'unsafe-inline' on script-src is what makes this safe to ship
  // without risking that same breakage in production; it still blocks
  // loading any script from a different origin, which is the more common
  // real-world injection vector. Revisit if a future Next.js version fixes
  // nonce propagation for self-hosted/Vercel Node runtimes.
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function securityHeaders(response: NextResponse, csp: string, isProd: boolean) {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  if (isProd) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProd = process.env.NODE_ENV === "production";
  const csp = buildCsp();

  if (pathname.startsWith("/api")) {
    const csrfError = checkCsrf(request);
    if (csrfError) return securityHeaders(csrfError, csp, isProd);

    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return securityHeaders(new NextResponse(null, { status: 204, headers: cors }), csp, isProd);
    }
    const response = NextResponse.next();
    cors.forEach((value, key) => response.headers.set(key, value));
    return securityHeaders(response, csp, isProd);
  }

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path);
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return securityHeaders(NextResponse.redirect(url), csp, isProd);
  }
  // NOTE: deliberately no "isPublic && hasSession -> redirect to /" shortcut
  // here. A cookie merely being present doesn't mean it's a *valid* session
  // (see db/schema.ts sessions table / lib/auth.ts getCurrentUser) — only a
  // DB lookup can tell, and middleware doesn't do one for cost reasons. The
  // root page (app/page.tsx) already does that real check server-side and
  // redirect()s to /login when the session doesn't verify. Redirecting away
  // from /login on cookie presence alone created an infinite loop for any
  // stale/invalid cookie: page.tsx sends / -> /login (no valid session),
  // this block sent /login -> / (cookie present), forever. A genuinely
  // logged-in user who navigates to /login by hand just sees the login
  // page, harmless compared to that.

  const response = NextResponse.next();
  return securityHeaders(response, csp, isProd);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|file.svg|globe.svg|window.svg).*)"],
};
