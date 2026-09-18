import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { withRoute } from "@/lib/api";

export const POST = withRoute(async () => {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
