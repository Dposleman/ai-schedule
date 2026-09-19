import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, withRoute } from "@/lib/api";
import { parseBody } from "@/lib/validation";

const languageSchema = z.object({ language: z.enum(["en", "da"], { error: "Invalid language." }) });

export const PATCH = withRoute(async (request: NextRequest) => {
  const { user, error } = await requireUser();
  if (error) return error;

  const { data, error: validationError } = await parseBody(request, languageSchema);
  if (validationError) return validationError;

  await db.update(users).set({ language: data.language }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
});
