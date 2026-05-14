import type { Event, RoleName } from "@prisma/client";
import { auth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  roles: RoleName[];
  mustChangePassword: boolean;
};

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user as SessionUser;
}

export async function requireRole(...roles: RoleName[]) {
  const u = await requireSession();
  if (!u.roles.some((r) => roles.includes(r))) throw new Error("FORBIDDEN");
  return u;
}

export function hasRole(user: SessionUser, ...roles: RoleName[]) {
  return user.roles.some((r) => roles.includes(r));
}

// ===== Event-scoped predicates =====

type EventLike = Pick<Event, "id" | "coordinatorId">;

export function isAdmin(u: SessionUser) {
  return u.roles.includes("ADMIN");
}

export function isAssignedCoordinator(u: SessionUser, ev: EventLike) {
  return ev.coordinatorId === u.id && u.roles.includes("COORDINATOR");
}

/** Event header / agenda / departments / send-sheet */
export function canEditEvent(u: SessionUser, ev: EventLike) {
  return isAdmin(u) || isAssignedCoordinator(u, ev);
}

export function canCreateEvent(u: SessionUser) {
  return isAdmin(u) || u.roles.includes("COORDINATOR");
}

export function canDeleteEvent(u: SessionUser) {
  return isAdmin(u);
}

/** Edit a specific dept's requirements on this event */
export function canEditDeptRequirements(
  u: SessionUser,
  ev: EventLike,
  managedDepartmentIds: string[],
  targetDepartmentId: string,
) {
  if (canEditEvent(u, ev)) return true;
  return (
    u.roles.includes("DEPT_MANAGER") &&
    managedDepartmentIds.includes(targetDepartmentId)
  );
}

export function canAssignTeamMember(
  u: SessionUser,
  ev: EventLike,
  managedDepartmentIds: string[],
  targetDepartmentId: string,
) {
  return canEditDeptRequirements(u, ev, managedDepartmentIds, targetDepartmentId);
}

/** Manager-only notes are visible to: admin, the event coordinator, the note's author */
export function canViewManagerNote(
  u: SessionUser,
  ev: EventLike,
  noteAuthorId: string,
) {
  if (isAdmin(u)) return true;
  if (isAssignedCoordinator(u, ev)) return true;
  return noteAuthorId === u.id;
}

export function canAuthorManagerNote(
  u: SessionUser,
  managedDepartmentIds: string[],
  targetDepartmentId: string,
) {
  if (isAdmin(u)) return true;
  return (
    u.roles.includes("DEPT_MANAGER") &&
    managedDepartmentIds.includes(targetDepartmentId)
  );
}

/** Client name + contact — coordinator-only sensitive info */
export function canViewClientDetails(u: SessionUser, ev: EventLike) {
  return isAdmin(u) || isAssignedCoordinator(u, ev);
}

/** Full function-sheet read access (excludes per-team-member partial view) */
export function canViewFullFunctionSheet(
  u: SessionUser,
  ev: EventLike,
  managedDepartmentIds: string[],
  eventDepartmentIds: string[],
) {
  if (isAdmin(u)) return true;
  if (isAssignedCoordinator(u, ev)) return true;
  if (u.roles.includes("DEPT_MANAGER")) return true;
  return false;
}

export function canExportPdf(
  u: SessionUser,
  ev: EventLike,
  managedDepartmentIds: string[],
  eventDepartmentIds: string[],
) {
  return canViewFullFunctionSheet(u, ev, managedDepartmentIds, eventDepartmentIds);
}

export function canViewGlobalAudit(u: SessionUser) {
  return isAdmin(u) || u.roles.includes("COORDINATOR");
}

export function canViewEventAudit(u: SessionUser, ev: EventLike) {
  return isAdmin(u) || isAssignedCoordinator(u, ev);
}

export function canManageAdmin(u: SessionUser) {
  return isAdmin(u);
}

/** Any authenticated user can toggle task completion */
export function canToggleTaskCompletion(u: SessionUser): boolean {
  return Boolean(u && u.id);
}

/** Any authenticated user can add task notes */
export function canAddTaskNote(u: SessionUser): boolean {
  return Boolean(u && u.id);
}

/** View task notes: coordinator/admin can see all, team members can see own + coordinator notes */
export function canViewTaskNotes(
  u: SessionUser,
  ev: EventLike,
  noteAuthorId: string,
): boolean {
  if (isAdmin(u)) return true;
  if (isAssignedCoordinator(u, ev)) return true;
  return noteAuthorId === u.id;
}

/** Only coordinator/admin can convert notes to tasks */
export function canConvertNoteToTask(u: SessionUser, ev: EventLike): boolean {
  return isAdmin(u) || isAssignedCoordinator(u, ev);
}
