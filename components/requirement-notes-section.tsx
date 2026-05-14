"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  addRequirementNoteAction,
  convertNoteToRequirementAction,
} from "@/server/actions/requirement-notes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
        <Textarea
          placeholder="Add a note..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          rows={3}
          className="resize-none"
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
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConvertingNoteId(note.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Convert to Task
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Convert Note to Task
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Create a new requirement from this note.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-4">
                        <div className="rounded-md bg-blue-50 p-3 text-sm">
                          <div className="font-medium text-blue-900 mb-1">
                            Original Note:
                          </div>
                          <p className="text-blue-800">{note.body}</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            Task Description
                          </label>
                          <Textarea
                            value={convertDescription}
                            onChange={(e) =>
                              setConvertDescription(e.target.value)
                            }
                            placeholder="Enter the task description..."
                            rows={4}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            handleConvertNote(note.id)
                          }
                          disabled={loading || !convertDescription.trim()}
                        >
                          Create Task
                        </AlertDialogAction>
                      </div>
                    </AlertDialogContent>
                  </AlertDialog>
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
    </div>
  );
}
