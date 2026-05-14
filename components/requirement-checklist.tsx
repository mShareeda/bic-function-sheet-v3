"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toggleTaskCompletionAction } from "@/server/actions/task-completion";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CompletionLog = {
  id: string;
  action: string;
  completedAt: Date;
  actor: { id: string; displayName: string };
};

export function RequirementChecklist({
  requirementId,
  eventId,
  isCompleted,
  completedAt,
  completedBy,
  completionLogs = [],
  onToggle,
}: {
  requirementId: string;
  eventId: string;
  isCompleted: boolean;
  completedAt: Date | null;
  completedBy: { displayName: string } | null;
  completionLogs?: CompletionLog[];
  onToggle: (completed: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    const result = await toggleTaskCompletionAction(
      requirementId,
      eventId,
      !isCompleted
    );
    setLoading(false);

    if (result.ok) {
      onToggle(!isCompleted);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={handleToggle}
          disabled={loading}
          className="mt-1"
        />
        <div className="flex-1">
          {isCompleted && completedBy && completedAt && (
            <div className="text-xs text-muted-foreground">
              Completed by {completedBy.displayName} on{" "}
              {format(new Date(completedAt), "MMM d, yyyy 'at' h:mm a")}
            </div>
          )}
        </div>
        {completionLogs.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-6 w-6 p-0"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", {
                "rotate-180": expanded,
              })}
            />
          </Button>
        )}
      </div>

      {expanded && completionLogs.length > 0 && (
        <div className="ml-7 space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium text-muted-foreground">History</div>
          {completionLogs.map((log) => (
            <div key={log.id} className="flex justify-between">
              <span className="text-muted-foreground">
                {log.actor.displayName} marked{" "}
                {log.action === "COMPLETED" ? "complete" : "incomplete"}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(log.completedAt), "MMM d h:mm a")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
