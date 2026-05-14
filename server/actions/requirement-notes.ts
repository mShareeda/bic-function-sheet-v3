"use server";

import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canEditDeptRequirements, canViewClientDetails } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

export type ActionResult = {
  ok: boolean;
  error?: string;
  data?: any;
};

export async function addRequirementNoteAction(
  requirementId: string,
  eventId: string,
  body: string
): Promise<ActionResult> {
  try {
    if (!body.trim()) {
      return { ok: false, error: "Note cannot be empty" };
    }

    const actor = await requireSession();

    // Fetch requirement to verify it exists and belongs to the event
    const requirement = await prisma.departmentRequirement.findUnique({
      where: { id: requirementId },
    });

    if (!requirement) {
      return { ok: false, error: "Requirement not found" };
    }

    if (requirement.eventId !== eventId) {
      return { ok: false, error: "Requirement does not belong to this event" };
    }

    // Create note
    const note = await prisma.requirementNote.create({
      data: {
        requirementId,
        authorId: actor.id,
        body,
      },
      include: {
        author: { select: { id: true, displayName: true } },
      },
    });

    // Log to audit
    await logAudit({
      actorId: actor.id,
      action: "CREATE",
      entityType: "RequirementNote",
      entityId: note.id,
      eventId,
      message: `Added note to requirement`,
    });

    return { ok: true, data: note };
  } catch (error) {
    console.error("addRequirementNoteAction error:", error);
    return { ok: false, error: "Failed to add note" };
  }
}

export async function convertNoteToRequirementAction(
  noteId: string,
  eventId: string,
  departmentId: string,
  description: string
): Promise<ActionResult> {
  try {
    const actor = await requireSession();

    // Fetch the note
    const note = await prisma.requirementNote.findUnique({
      where: { id: noteId },
      include: { requirement: { include: { event: true } } },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    // Verify the note belongs to the event
    if (note.requirement.eventId !== eventId) {
      return { ok: false, error: "Note does not belong to this event" };
    }

    // Check authorization - only coordinator/admin can create requirements
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return { ok: false, error: "Event not found" };
    }

    const isCoordinator =
      event.coordinatorId === actor.id || actor.roles.includes("ADMIN");
    if (!isCoordinator) {
      return { ok: false, error: "Only coordinators can create requirements from notes" };
    }

    // Create new requirement from note
    const eventDept = await prisma.eventDepartment.findUnique({
      where: {
        eventId_departmentId: {
          eventId,
          departmentId,
        },
      },
    });

    if (!eventDept) {
      return { ok: false, error: "Department not found for this event" };
    }

    const newRequirement = await prisma.departmentRequirement.create({
      data: {
        eventId,
        departmentId,
        eventDepartmentId: eventDept.id,
        description,
        updatedById: actor.id,
      },
    });

    // Log to audit
    await logAudit({
      actorId: actor.id,
      action: "CREATE",
      entityType: "DepartmentRequirement",
      entityId: newRequirement.id,
      eventId,
      message: `Created requirement from team member note`,
    });

    return { ok: true, data: newRequirement };
  } catch (error) {
    console.error("convertNoteToRequirementAction error:", error);
    return { ok: false, error: "Failed to create requirement from note" };
  }
}

export async function getRequirementNotesAction(
  requirementId: string,
  eventId: string
): Promise<ActionResult> {
  try {
    const actor = await requireSession();

    const requirement = await prisma.departmentRequirement.findUnique({
      where: { id: requirementId },
      include: {
        managerNotes: {
          include: {
            author: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        event: true,
      },
    });

    if (!requirement) {
      return { ok: false, error: "Requirement not found" };
    }

    // Check authorization
    const isCoordinator = requirement.event.coordinatorId === actor.id;
    const isAdmin = actor.roles.includes("ADMIN");
    const isAuthor = (noteId: string) => false; // Will check per note

    // Filter notes based on visibility
    const visibleNotes = requirement.managerNotes.filter((note) => {
      return (
        isCoordinator ||
        isAdmin ||
        note.authorId === actor.id
      );
    });

    return { ok: true, data: visibleNotes };
  } catch (error) {
    console.error("getRequirementNotesAction error:", error);
    return { ok: false, error: "Failed to fetch notes" };
  }
}
