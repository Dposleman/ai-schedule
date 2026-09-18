import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, badRequest, withRoute } from "@/lib/api";

export const PATCH = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  if (body.language !== "en" && body.language !== "da") {
    return badRequest("Invalid language.");
  }

  await db.update(users).set({ language: body.language }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
});
