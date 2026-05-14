"use server";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { buildDiff } from "@/lib/audit";

export type ActionResult = {
  ok: boolean;
  error?: string;
  data?: any;
};

export async function toggleTaskCompletionAction(
  requirementId: string,
  eventId: string,
  completed: boolean
): Promise<ActionResult> {
  try {
    const actor = await requireSession();

    // Fetch requirement to check current state
    const requirement = await prisma.departmentRequirement.findUnique({
      where: { id: requirementId },
      include: { completionLogs: { orderBy: { completedAt: "desc" }, take: 1 } },
    });

    if (!requirement) {
      return { ok: false, error: "Requirement not found" };
    }

    if (requirement.eventId !== eventId) {
      return { ok: false, error: "Requirement does not belong to this event" };
    }

    // Track before state
    const before = {
      isCompleted: requirement.isCompleted,
      completedAt: requirement.completedAt,
    };

    // Update requirement
    const updated = await prisma.departmentRequirement.update({
      where: { id: requirementId },
      data: {
        isCompleted: completed,
        completedAt: completed ? new Date() : null,
        completedById: completed ? actor.id : null,
      },
    });

    // Create completion log
    await prisma.requirementCompletionLog.create({
      data: {
        requirementId,
        eventId,
        action: completed ? "COMPLETED" : "UNCOMPLETED",
        actorId: actor.id,
        completedAt: new Date(),
      },
    });

    // Log to audit
    const diff = buildDiff(before, {
      isCompleted: updated.isCompleted,
      completedAt: updated.completedAt,
    });

    await logAudit({
      actorId: actor.id,
      action: "UPDATE",
      entityType: "DepartmentRequirement",
      entityId: requirementId,
      eventId,
      diff,
      message: `Task marked ${completed ? "complete" : "incomplete"}`,
    });

    return { ok: true, data: updated };
  } catch (error) {
    console.error("toggleTaskCompletionAction error:", error);
    return { ok: false, error: "Failed to update task completion" };
  }
}

export async function getCompletionHistoryAction(
  requirementId: string
): Promise<ActionResult> {
  try {
    const actor = await requireSession();

    const logs = await prisma.requirementCompletionLog.findMany({
      where: { requirementId },
      include: {
        actor: { select: { id: true, displayName: true } },
      },
      orderBy: { completedAt: "desc" },
    });

    return { ok: true, data: logs };
  } catch (error) {
    console.error("getCompletionHistoryAction error:", error);
    return { ok: false, error: "Failed to fetch completion history" };
  }
}
