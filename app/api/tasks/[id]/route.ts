import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { dailyTasks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, notFound, withRoute } from "@/lib/api";
import { parseBody } from "@/lib/validation";

const patchTaskSchema = z.object({ completed: z.boolean().optional().default(false) });

export const PATCH = withRoute(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, error } = await requireUser();
  if (error) return error;

  const [existing] = await db.select().from(dailyTasks).where(and(eq(dailyTasks.id, id), eq(dailyTasks.orgId, user.orgId))).limit(1);
  if (!existing) return notFound("Task not found.");

  const { data, error: validationError } = await parseBody(request, patchTaskSchema);
  if (validationError) return validationError;
  await db.update(dailyTasks).set({ completed: data.completed ? 1 : 0 }).where(eq(dailyTasks.id, id));
  return NextResponse.json({ ok: true });
});
