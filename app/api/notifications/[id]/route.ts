import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, notFound, withRoute } from "@/lib/api";

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [existing] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .limit(1);
  if (!existing) return notFound("Notification not found.");

  await db.update(notifications).set({ readAt: new Date().toISOString() }).where(eq(notifications.id, id));
  return NextResponse.json({ ok: true });
});
