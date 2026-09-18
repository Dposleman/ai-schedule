import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/api";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  const unread = rows.filter((row) => !row.readAt).length;
  return NextResponse.json({ notifications: rows, unread });
}

// Mark every one of the current user's notifications as read.
export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;
  await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  return NextResponse.json({ ok: true });
}
