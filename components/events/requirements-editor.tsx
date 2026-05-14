"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  upsertRequirementAction,
  deleteRequirementAction,
  assignTeamMemberAction,
  unassignTeamMemberAction,
  reorderRequirementsAction,
} from "@/server/actions/requirements";
import { AttachmentPanel } from "@/components/events/attachment-panel";
import type { AttachmentItem } from "@/components/events/attachment-panel";
import { RequirementChecklist } from "@/components/requirement-checklist";
import { RequirementNotesSection } from "@/components/requirement-notes-section";

type Member = { id: string; displayName: string };
type Note = { id: string; body: string; author: { id: string; displayName: string }; createdAt: Date };
type Assignment = { userId: string; user: { id: string; displayName: string } };
type CompletionLog = {
  id: string;
  action: string;
  completedAt: Date;
  actor: { id: string; displayName: string };
};
type Requirement = {
  id: string; description: string; priority: string | null; sortOrder: number;
  isCompleted?: boolean; completedAt?: Date | null; completedById?: string;
  assignments: Assignment[]; managerNotes: Note[]; attachments: AttachmentItem[];
  completionLogs?: CompletionLog[];
  completedBy?: { displayName: string } | null;
};

function SortableRequirementCard({
  req, eventId, deptId, editId, setEditId, pending,
  submitReq, delReq, assign, unassign,
  canAssign, canAddNotes, canManageAttachments, deptMembers, error, currentUserId, isCoordinator,
}: {
  req: Requirement; eventId: string; deptId: string;
  editId: string | null; setEditId: (id: string | null) => void;
  pending: boolean;
  submitReq: (id: string | null) => (e: React.FormEvent<HTMLFormElement>) => void;
  delReq: (id: string) => void;
  assign: (reqId: string, userId: string) => void;
  unassign: (reqId: string, userId: string) => void;
  canAssign: boolean; canAddNotes: boolean; canManageAttachments: boolean;
  deptMembers: Member[]; error: string | null;
  currentUserId: string; isCoordinator: boolean;
}) {
  const [notesRefresh, setNotesRefresh] = useState(0);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: req.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardContent className="py-4 space-y-3">
          {editId === req.id ? (
            <ReqForm req={req} onSubmit={submitReq(req.id)} pending={pending} onCancel={() => setEditId(null)} error={error} />
          ) : (
            <>
              <div className="flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  className="mt-0.5 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  aria-label="Drag to reorder"
                  {...attributes}
                  {...listeners}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <div className="flex-1">
                  <p className="text-sm whitespace-pre-wrap">{req.description}</p>
                  {req.priority && <Badge variant="outline" className="mt-1 text-xs">{req.priority}</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditId(req.id)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => delReq(req.id)} disabled={pending}>Delete</Button>
                </div>
              </div>

              {/* Task Completion Checklist */}
              {req.isCompleted !== undefined && (
                <div className="border-t pt-3">
                  <RequirementChecklist
                    requirementId={req.id}
                    eventId={eventId}
                    isCompleted={req.isCompleted || false}
                    completedAt={req.completedAt || null}
                    completedBy={req.completedBy || null}
                    completionLogs={req.completionLogs || []}
                    onToggle={() => setNotesRefresh(prev => prev + 1)}
                  />
                </div>
              )}

                {/* Assignments */}
                {canAssign && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Assigned team</p>
                    <div className="flex flex-wrap gap-2">
                      {req.assignments.map((a) => (
                        <span key={a.userId} className="flex items-center gap-1 text-xs bg-muted rounded-full px-3 py-1">
                          {a.user.displayName}
                          <button type="button" onClick={() => unassign(req.id, a.userId)} disabled={pending} className="text-muted-foreground hover:text-destructive ml-1">×</button>
                        </span>
                      ))}
                    </div>
                    <AssignSelect
                      requirementId={req.id}
                      members={deptMembers}
                      assignedIds={req.assignments.map((a) => a.userId)}
                      onAssign={assign}
                      pending={pending}
                    />
                  </div>
                )}

                {/* Team Notes Section */}
                <RequirementNotesSection
                  requirementId={req.id}
                  eventId={eventId}
                  departmentId={deptId}
                  notes={req.managerNotes}
                  currentUserId={currentUserId}
                  isCoordinator={isCoordinator}
                  onNoteAdded={() => setNotesRefresh(prev => prev + 1)}
                />

                {/* Attachments */}
                {(canManageAttachments || req.attachments.length > 0) && (
                  <div className="border-t pt-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Attachments</p>
                    <AttachmentPanel
                      attachments={req.attachments}
                      scope={{ requirementId: req.id }}
                      canUpload={canManageAttachments}
                      canDelete={canManageAttachments}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
    </div>
  );
}

export function RequirementsEditor({
  eventId, deptId, requirements, deptMembers, canAssign, canAddNotes, canManageAttachments,
  currentUserId, isCoordinator,
}: {
  eventId: string; deptId: string;
  requirements: Requirement[]; deptMembers: Member[];
  canAssign: boolean; canAddNotes: boolean; canManageAttachments: boolean;
  currentUserId: string; isCoordinator: boolean;
}) {
  const [orderedReqs, setOrderedReqs] = useState(requirements);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => { setOrderedReqs(requirements); }, [requirements]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedReqs.findIndex((r) => r.id === active.id);
    const newIndex = orderedReqs.findIndex((r) => r.id === over.id);
    const newOrder = arrayMove(orderedReqs, oldIndex, newIndex);
    setOrderedReqs(newOrder);
    startTransition(async () => {
      await reorderRequirementsAction(eventId, deptId, newOrder.map((r) => r.id));
    });
  }

  function submitReq(requirementId: string | null) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const fd = new FormData(e.currentTarget);
      startTransition(async () => {
        const r = await upsertRequirementAction(eventId, deptId, requirementId, fd);
        if (r.ok) { setShowAdd(false); setEditId(null); }
        else setError(r.error);
      });
    };
  }

  function delReq(id: string) {
    startTransition(async () => {
      await deleteRequirementAction(id, eventId);
    });
  }

  function assign(requirementId: string, userId: string) {
    startTransition(async () => {
      await assignTeamMemberAction(requirementId, userId, eventId);
    });
  }

  function unassign(requirementId: string, userId: string) {
    startTransition(async () => {
      await unassignTeamMemberAction(requirementId, userId, eventId);
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedReqs.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {orderedReqs.map((req) => (
            <SortableRequirementCard
              key={req.id}
              req={req}
              eventId={eventId}
              deptId={deptId}
              editId={editId}
              setEditId={setEditId}
              pending={pending}
              submitReq={submitReq}
              delReq={delReq}
              assign={assign}
              unassign={unassign}
              canAssign={canAssign}
              canAddNotes={canAddNotes}
              canManageAttachments={canManageAttachments}
              deptMembers={deptMembers}
              error={error}
              currentUserId={currentUserId}
              isCoordinator={isCoordinator}
            />
          ))}
          {showAdd ? (
            <Card>
              <CardContent className="py-4">
                <ReqForm onSubmit={submitReq(null)} pending={pending} onCancel={() => setShowAdd(false)} error={error} />
              </CardContent>
            </Card>
          ) : (
            <Button variant="outline" onClick={() => setShowAdd(true)}>+ Add requirement</Button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function ReqForm({ req, onSubmit, pending, onCancel, error }: {
  req?: Requirement; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  pending: boolean; onCancel: () => void; error: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Description *</Label>
        <textarea name="description" defaultValue={req?.description}
          className="w-full rounded-md border border-input px-3 py-2 text-sm min-h-[80px]" required />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Priority (optional)</Label>
        <Input name="priority" defaultValue={req?.priority ?? ""} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "…" : "Save"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function AssignSelect({ requirementId, members, assignedIds, onAssign, pending }: {
  requirementId: string; members: Member[]; assignedIds: string[];
  onAssign: (reqId: string, userId: string) => void; pending: boolean;
}) {
  const available = members.filter((m) => !assignedIds.includes(m.id));
  if (!available.length) return null;
  return (
    <select
      className="h-9 rounded-md border border-input px-3 text-sm"
      onChange={(e) => { if (e.target.value) { onAssign(requirementId, e.target.value); e.target.value = ""; } }}
      disabled={pending}
    >
      <option value="">+ Assign team member…</option>
      {available.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
    </select>
  );
}

