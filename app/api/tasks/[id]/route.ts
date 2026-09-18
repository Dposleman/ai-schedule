import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dailyTasks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, notFound } from "@/lib/api";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [existing] = await db.select().from(dailyTasks).where(and(eq(dailyTasks.id, id), eq(dailyTasks.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Task not found.");

  const body = await request.json().catch(() => ({}));
  await db.update(dailyTasks).set({ completed: body.completed ? 1 : 0 }).where(eq(dailyTasks.id, id));
  return NextResponse.json({ ok: true });
}
