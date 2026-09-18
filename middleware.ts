import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

const PUBLIC_PATHS = ["/login", "/signup"];

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    const headers = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers });
    }
    const response = NextResponse.next();
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path);
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (isPublic && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|file.svg|globe.svg|window.svg).*)"],
};
