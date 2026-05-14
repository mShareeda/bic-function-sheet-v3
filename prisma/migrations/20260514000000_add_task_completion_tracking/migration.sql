-- Add task completion tracking to DepartmentRequirement
ALTER TABLE "DepartmentRequirement" ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DepartmentRequirement" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "DepartmentRequirement" ADD COLUMN "completedById" TEXT;

-- Create RequirementCompletionLog table
CREATE TABLE "RequirementCompletionLog" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "RequirementCompletionLog_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "RequirementCompletionLog" ADD CONSTRAINT "RequirementCompletionLog_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "DepartmentRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequirementCompletionLog" ADD CONSTRAINT "RequirementCompletionLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequirementCompletionLog" ADD CONSTRAINT "RequirementCompletionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX "RequirementCompletionLog_requirementId_idx" ON "RequirementCompletionLog"("requirementId");
CREATE INDEX "RequirementCompletionLog_eventId_idx" ON "RequirementCompletionLog"("eventId");
CREATE INDEX "RequirementCompletionLog_actorId_idx" ON "RequirementCompletionLog"("actorId");
