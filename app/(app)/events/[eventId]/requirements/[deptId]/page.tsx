import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditEvent, canEditDeptRequirements, canViewManagerNote } from "@/lib/authz";
import type { SessionUser } from "@/lib/authz";
import { RequirementsEditor } from "@/components/events/requirements-editor";

export default async function DeptRequirementsPage({
  params,
}: {
  params: Promise<{ eventId: string; deptId: string }>;
}) {
  const { eventId, deptId } = await params;
  const session = await auth();
  const u = session!.user as SessionUser;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) notFound();

  const memberOf = await prisma.departmentMember.findMany({
    where: { userId: u.id, isManager: true },
    select: { departmentId: true },
  });
  const managedDeptIds = memberOf.map((m) => m.departmentId);

  if (!canEditDeptRequirements(u, event, managedDeptIds, deptId)) {
    redirect(`/events/${eventId}`);
  }

  const dept = await prisma.department.findUnique({ where: { id: deptId } });
  if (!dept) notFound();

  const requirements = await prisma.departmentRequirement.findMany({
    where: { eventId, departmentId: deptId },
    include: {
      assignments: { include: { user: { select: { id: true, displayName: true } } } },
      managerNotes: { include: { author: { select: { id: true, displayName: true } } } },
      attachments: {
        include: { uploadedBy: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
      completionLogs: {
        include: { actor: { select: { id: true, displayName: true } } },
        orderBy: { completedAt: "desc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Only dept members are valid assignees
  const deptMembers = await prisma.departmentMember.findMany({
    where: { departmentId: deptId },
    include: { user: { select: { id: true, displayName: true } } },
  });

  const isCoordOrAdmin = canEditEvent(u, event);

  // Get completed by user if task is marked complete
  const completedByUsers = new Map<string, { displayName: string }>();
  for (const req of requirements) {
    if (req.completedById) {
      if (!completedByUsers.has(req.completedById)) {
        const user = await prisma.user.findUnique({
          where: { id: req.completedById },
          select: { displayName: true },
        });
        if (user) completedByUsers.set(req.completedById, user);
      }
    }
  }

  // Filter notes per auth rule; serialize dates for client component
  const requirementsWithNotes = requirements.map((r) => ({
    ...r,
    completedById: r.completedById || undefined,
    completedBy: r.completedById ? completedByUsers.get(r.completedById) || null : null,
    managerNotes: r.managerNotes.filter((n) =>
      canViewManagerNote(u, event, n.authorId)
    ),
    attachments: r.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      byteSize: a.byteSize,
      storageKey: a.storageKey,
      createdAt: a.createdAt.toISOString(),
      uploadedBy: a.uploadedBy,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{dept.name}</h1>
        <p className="text-sm text-muted-foreground">{event.title}</p>
      </div>
      <RequirementsEditor
        eventId={eventId}
        deptId={deptId}
        requirements={requirementsWithNotes}
        deptMembers={deptMembers.map((m) => m.user)}
        canAssign={isCoordOrAdmin || managedDeptIds.includes(deptId)}
        canAddNotes={managedDeptIds.includes(deptId) || isCoordOrAdmin}
        canManageAttachments={isCoordOrAdmin || managedDeptIds.includes(deptId)}
        currentUserId={u.id}
        isCoordinator={isCoordOrAdmin}
      />
    </div>
  );
}
