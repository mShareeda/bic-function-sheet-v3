"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  addRequirementNoteAction,
  convertNoteToRequirementAction,
} from "@/server/actions/requirement-notes";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus, Trash2 } from "lucide-react";

type Note = {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; displayName: string };
};

export function RequirementNotesSection({
  requirementId,
  eventId,
  departmentId,
  notes = [],
  currentUserId,
  isCoordinator,
  onNoteAdded,
}: {
  requirementId: string;
  eventId: string;
  departmentId: string;
  notes?: Note[];
  currentUserId: string;
  isCoordinator: boolean;
  onNoteAdded: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convertingNoteId, setConvertingNoteId] = useState<string | null>(null);
  const [convertDescription, setConvertDescription] = useState("");

  const handleAddNote = async () => {
    if (!input.trim()) return;

    setLoading(true);
    const result = await addRequirementNoteAction(
      requirementId,
      eventId,
      input
    );
    setLoading(false);

    if (result.ok) {
      setInput("");
      onNoteAdded();
    }
  };

  const handleConvertNote = async (noteId: string) => {
    if (!convertDescription.trim()) return;

    setLoading(true);
    const result = await convertNoteToRequirementAction(
      noteId,
      eventId,
      departmentId,
      convertDescription
    );
    setLoading(false);

    if (result.ok) {
      setConvertingNoteId(null);
      setConvertDescription("");
      onNoteAdded();
    }
  };

  // Filter notes based on visibility
  const visibleNotes = notes.filter((note) => {
    return isCoordinator || note.author.id === currentUserId;
  });

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="text-sm font-semibold">Team Notes</h4>

      {/* Note Input */}
      <div className="space-y-2">
        <textarea
          placeholder="Add a note..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full resize-none rounded-md border border-input px-3 py-2 text-sm"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleAddNote}
            disabled={loading || !input.trim()}
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Note
          </Button>
        </div>
      </div>

      {/* Notes List */}
      {visibleNotes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {visibleNotes.length} {visibleNotes.length === 1 ? "Note" : "Notes"}
          </div>
          {visibleNotes.map((note) => (
            <div
              key={note.id}
              className="rounded-md bg-muted/50 p-3 text-sm space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-xs">
                    {note.author.displayName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(note.createdAt), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                {isCoordinator && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConvertingNoteId(note.id)}
                    className="h-7 px-2 text-xs"
                  >
                    Convert to Task
                  </Button>
                )}
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {note.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* No Notes Message */}
      {visibleNotes.length === 0 && (
        <div className="rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
          {isCoordinator
            ? "No notes yet. Team members will add notes here."
            : "No notes visible to you."}
        </div>
      )}

      {/* Coordinator Info */}
      {isCoordinator && notes.length !== visibleNotes.length && (
        <div className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {notes.length - visibleNotes.length} note(s) hidden from team members
          </span>
        </div>
      )}

      {/* Convert Note Modal */}
      {convertingNoteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-white p-6 shadow-lg max-w-md w-full mx-4 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Convert Note to Task</h2>
              <p className="text-sm text-muted-foreground">Create a new requirement from this note.</p>
            </div>
            <div className="rounded-md bg-blue-50 p-3 text-sm">
              <div className="font-medium text-blue-900 mb-1">Original Note:</div>
              <p className="text-blue-800">
                {notes.find((n) => n.id === convertingNoteId)?.body}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Task Description</label>
              <textarea
                value={convertDescription}
                onChange={(e) => setConvertDescription(e.target.value)}
                placeholder="Enter the task description..."
                rows={4}
                className="w-full resize-none rounded-md border border-input px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConvertingNoteId(null);
                  setConvertDescription("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleConvertNote(convertingNoteId)}
                disabled={loading || !convertDescription.trim()}
              >
                Create Task
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
