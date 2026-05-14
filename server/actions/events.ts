"use server";

// Trigger deployment
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, canEditEvent, canCreateEvent, canDeleteEvent, isAdmin } from "@/lib/authz";
import { logAudit, buildDiff } from "@/lib/audit";
import { notify } from "@/lib/notifications";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const eventSchema = z.object({
  title: z.string().min(2),
  eventDate: z.string().datetime({ offset: true }).or(z.string().date()),
  confirmationReceived: z.string().datetime({ offset: true }).or(z.string().date()).optional().or(z.literal("")),
  coordinatorId: z.string().cuid().optional().or(z.literal("")),
  salespersonName: z.string().optional(),
  maximizerNumber: z.string().optional(),
  isVip: z.string().optional(),
  estimatedGuests: z.string().optional(),
  clientName: z.string().optional(),
  clientContact: z.string().optional(),
  setupStart: z.string().datetime({ offset: true }).or(z.string()),
  setupEnd: z.string().datetime({ offset: true }).or(z.string()),
  liveStart: z.string().datetime({ offset: true }).or(z.string()),
  liveEnd: z.string().datetime({ offset: true }).or(z.string()),
  breakdownStart: z.string().datetime({ offset: true }).or(z.string()),
  breakdownEnd: z.string().datetime({ offset: true }).or(z.string()),
}).superRefine((d, ctx) => {
  const ts = (s: string) => new Date(s).getTime();
  const [ss, se, ls, le, bs, be] = [d.setupStart, d.setupEnd, d.liveStart, d.liveEnd, d.breakdownStart, d.breakdownEnd].map(ts);
  if (ss >= se) ctx.addIssue({ code: "custom", message: "Setup start must be before setup end.", path: ["setupEnd"] });
  if (se > ls)  ctx.addIssue({ code: "custom", message: "Setup end must not be after live start.", path: ["liveStart"] });
  if (ls >= le) ctx.addIssue({ code: "custom", message: "Live start must be before live end.", path: ["liveEnd"] });
  if (le > bs)  ctx.addIssue({ code: "custom", message: "Live end must not be after breakdown start.", path: ["breakdownStart"] });
  if (bs >= be) ctx.addIssue({ code: "custom", message: "Breakdown start must be before breakdown end.", path: ["breakdownEnd"] });
});

function parseDate(s: string | undefined) {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function createEventAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  if (!canCreateEvent(actor)) return { ok: false, error: "Not allowed." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const d = parsed.data;
  const coordId = d.coordinatorId || null;

  const event = await prisma.event.create({
    data: {
      title: d.title,
      eventDate: new Date(d.eventDate),
      confirmationReceived: d.confirmationReceived ? new Date(d.confirmationReceived) : null,
      coordinatorId: coordId,
      salespersonName: d.salespersonName || null,
      maximizerNumber: d.maximizerNumber || null,
      isVip: d.isVip === "true" || d.isVip === "on",
      estimatedGuests: d.estimatedGuests ? parseInt(d.estimatedGuests) : null,
      clientName: d.clientName || null,
      clientContact: d.clientContact || null,
      setupStart: new Date(d.setupStart),
      setupEnd: new Date(d.setupEnd),
      liveStart: new Date(d.liveStart),
      liveEnd: new Date(d.liveEnd),
      breakdownStart: new Date(d.breakdownStart),
      breakdownEnd: new Date(d.breakdownEnd),
      createdById: actor.id,
    },
  });

  await logAudit({ actorId: actor.id, action: "CREATE", entityType: "Event", entityId: event.id, eventId: event.id });

  if (coordId && coordId !== actor.id) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await notify({
      userIds: [coordId],
      type: "EVENT_ASSIGNED",
      title: `You've been assigned as coordinator for: ${event.title}`,
      body: `Event date: ${new Date(event.eventDate).toLocaleDateString()}`,
      eventId: event.id,
      url: `${appUrl}/events/${event.id}`,
      sendEmail: true,
      emailSubject: `[BIC] You're the coordinator for: ${event.title}`,
      emailText: `You've been assigned as event coordinator for "${event.title}" on ${new Date(event.eventDate).toLocaleDateString()}.\n\nView it: ${appUrl}/events/${event.id}`,
      emailHtml: `<p>You've been assigned as event coordinator for <strong>${event.title}</strong> on ${new Date(event.eventDate).toLocaleDateString()}.</p><p><a href="${appUrl}/events/${event.id}">View the event</a></p>`,
    });
  }

  redirect(`/events/${event.id}`);
}

export async function updateEventAction(eventId: string, formData: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: "Not found." };
  if (!canEditEvent(actor, event)) return { ok: false, error: "Not allowed." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const d = parsed.data;
  const coordId = d.coordinatorId || null;
  const prevCoordId = event.coordinatorId;

  const before = {
    title: event.title, coordinatorId: event.coordinatorId, isVip: event.isVip, status: event.status,
  };

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: {
      title: d.title,
      eventDate: new Date(d.eventDate),
      confirmationReceived: parseDate(d.confirmationReceived),
      coordinatorId: coordId,
      salespersonName: d.salespersonName || null,
      maximizerNumber: d.maximizerNumber || null,
      isVip: d.isVip === "true" || d.isVip === "on",
      estimatedGuests: d.estimatedGuests ? parseInt(d.estimatedGuests) : null,
      clientName: d.clientName || null,
      clientContact: d.clientContact || null,
      setupStart: new Date(d.setupStart),
      setupEnd: new Date(d.setupEnd),
      liveStart: new Date(d.liveStart),
      liveEnd: new Date(d.liveEnd),
      breakdownStart: new Date(d.breakdownStart),
      breakdownEnd: new Date(d.breakdownEnd),
      ...(event.functionSheetSentAt ? { lastEditedAfterSendAt: new Date() } : {}),
    },
  });

  const diff = buildDiff(before as Record<string, unknown>, {
    title: updated.title, coordinatorId: updated.coordinatorId, isVip: updated.isVip, status: updated.status,
  });
  await logAudit({ actorId: actor.id, action: "UPDATE", entityType: "Event", entityId: eventId, eventId, diff });

  // Notify coordinator change
  if (coordId && coordId !== prevCoordId) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await notify({
      userIds: [coordId],
      type: "EVENT_ASSIGNED",
      title: `You've been assigned as coordinator for: ${updated.title}`,
      body: `Event date: ${updated.eventDate.toLocaleDateString()}`,
      eventId,
      url: `${appUrl}/events/${eventId}`,
      sendEmail: true,
      emailSubject: `[BIC] You're the coordinator for: ${updated.title}`,
      emailText: `You've been assigned as event coordinator for "${updated.title}".\n\nView it: ${appUrl}/events/${eventId}`,
      emailHtml: `<p>You've been assigned as coordinator for <strong>${updated.title}</strong>.</p><p><a href="${appUrl}/events/${eventId}">View the event</a></p>`,
    });
  }

  // Notify edit-after-send
  if (event.functionSheetSentAt) {
    await notifyFunctionSheetUpdated(eventId, `Event header updated by ${actor.displayName}`, actor.id);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function updateEventStatusAction(
  eventId: string,
  status: string,
): Promise<ActionResult> {
  const actor = await requireSession();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: "Not found." };
  if (!canEditEvent(actor, event)) return { ok: false, error: "Not allowed." };

  const validStatuses = [
    "DRAFT","CONFIRMED","PROVISIONAL_FUNCTION_SHEET_SENT",
    "FUNCTION_SHEET_SENT","IN_SETUP","LIVE","CLOSED","ARCHIVED",
  ] as const;
  if (!validStatuses.includes(status as (typeof validStatuses)[number])) return { ok: false, error: "Invalid status." };

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: {
      status: status as typeof validStatuses[number],
      // Record first send (provisional or final)
      ...(
        (status === "PROVISIONAL_FUNCTION_SHEET_SENT" || status === "FUNCTION_SHEET_SENT") &&
        !event.functionSheetSentAt
          ? { functionSheetSentAt: new Date() }
          : {}
      ),
    },
  });

  await logAudit({ actorId: actor.id, action: "STATUS_CHANGE", entityType: "Event", entityId: eventId, eventId, diff: { status: { before: event.status, after: status } } });

  if (status === "PROVISIONAL_FUNCTION_SHEET_SENT") {
    await sendFunctionSheetNotifications(eventId, actor.id, true);
  } else if (status === "FUNCTION_SHEET_SENT") {
    if (event.status === "PROVISIONAL_FUNCTION_SHEET_SENT") {
      // Upgrading from provisional → final: notify update
      await notifyFunctionSheetUpdated(
        eventId,
        `Provisional function sheet confirmed as final by ${actor.displayName}`,
        actor.id,
      );
    } else {
      await sendFunctionSheetNotifications(eventId, actor.id, false);
    }
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function sendFunctionSheetAction(eventId: string): Promise<ActionResult> {
  return updateEventStatusAction(eventId, "FUNCTION_SHEET_SENT");
}

export async function sendProvisionalFunctionSheetAction(eventId: string): Promise<ActionResult> {
  return updateEventStatusAction(eventId, "PROVISIONAL_FUNCTION_SHEET_SENT");
}

// ── Wizard: create event end-to-end (details + schedule + agenda + departments + reqs) ──

const wizardAgendaSchema = z.object({
  description: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  venueId: z.string().nullable().optional(),
  venueText: z.string().nullable().optional(),
});

const wizardDepartmentSchema = z.object({
  departmentId: z.string().min(1),
  requirements: z.string().optional(),
});

const wizardSchema = z.object({
  title: z.string().min(2),
  eventDate: z.string().min(1),
  confirmationReceived: z.string().nullable().optional(),
  coordinatorId: z.string().nullable().optional(),
  salespersonName: z.string().nullable().optional(),
  maximizerNumber: z.string().nullable().optional(),
  isVip: z.boolean().optional(),
  estimatedGuests: z.number().int().nullable().optional(),
  clientName: z.string().nullable().optional(),
  clientContact: z.string().nullable().optional(),
  setupStart: z.string().min(1),
  setupEnd: z.string().min(1),
  liveStart: z.string().min(1),
  liveEnd: z.string().min(1),
  breakdownStart: z.string().min(1),
  breakdownEnd: z.string().min(1),
  venueIds: z.array(z.string()).default([]),
  agenda: z.array(wizardAgendaSchema),
  departments: z.array(wizardDepartmentSchema),
  sendMode: z.enum(["draft", "full", "provisional"]).optional(),
});

export type WizardPayload = z.infer<typeof wizardSchema>;

export async function createEventCompleteAction(
  payload: WizardPayload,
): Promise<ActionResult> {
  const actor = await requireSession();
  if (!canCreateEvent(actor)) return { ok: false, error: "Not allowed." };

  const parsed = wizardSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const d = parsed.data;
  const coordId = d.coordinatorId || null;

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: d.title,
        eventDate: new Date(d.eventDate),
        confirmationReceived: d.confirmationReceived
          ? new Date(d.confirmationReceived)
          : null,
        coordinatorId: coordId,
        salespersonName: d.salespersonName || null,
        maximizerNumber: d.maximizerNumber || null,
        isVip: !!d.isVip,
        estimatedGuests: d.estimatedGuests ?? null,
        clientName: d.clientName || null,
        clientContact: d.clientContact || null,
        setupStart: new Date(d.setupStart),
        setupEnd: new Date(d.setupEnd),
        liveStart: new Date(d.liveStart),
        liveEnd: new Date(d.liveEnd),
        breakdownStart: new Date(d.breakdownStart),
        breakdownEnd: new Date(d.breakdownEnd),
        createdById: actor.id,
      },
    });

    if (d.venueIds.length > 0) {
      await tx.eventVenue.createMany({
        data: d.venueIds.map((venueId) => ({
          eventId: created.id,
          venueId,
        })),
      });
    }

    if (d.agenda.length > 0) {
      await tx.agendaItem.createMany({
        data: d.agenda.map((a, i) => ({
          eventId: created.id,
          sequence: i + 1,
          startTime: new Date(a.startTime),
          endTime: new Date(a.endTime),
          venueId: a.venueId || null,
          venueText: a.venueText || null,
          description: a.description,
          participants: null,
        })),
      });
    }

    for (const dept of d.departments) {
      const ed = await tx.eventDepartment.create({
        data: { eventId: created.id, departmentId: dept.departmentId },
      });
      const reqText = dept.requirements?.trim();
      if (reqText) {
        await tx.departmentRequirement.create({
          data: {
            eventId: created.id,
            departmentId: dept.departmentId,
            eventDepartmentId: ed.id,
            description: reqText,
            sortOrder: 0,
            updatedById: actor.id,
          },
        });
      }
    }

    return created;
  });

  await logAudit({
    actorId: actor.id,
    action: "CREATE",
    entityType: "Event",
    entityId: event.id,
    eventId: event.id,
  });

  if (coordId && coordId !== actor.id) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await notify({
      userIds: [coordId],
      type: "EVENT_ASSIGNED",
      title: `You've been assigned as coordinator for: ${event.title}`,
      body: `Event date: ${event.eventDate.toLocaleDateString()}`,
      eventId: event.id,
      url: `${appUrl}/events/${event.id}`,
      sendEmail: true,
      emailSubject: `[BIC] You're the coordinator for: ${event.title}`,
      emailText: `You've been assigned as event coordinator for "${event.title}" on ${event.eventDate.toLocaleDateString()}.\n\nView it: ${appUrl}/events/${event.id}`,
      emailHtml: `<p>You've been assigned as event coordinator for <strong>${event.title}</strong> on ${event.eventDate.toLocaleDateString()}.</p><p><a href="${appUrl}/events/${event.id}">View the event</a></p>`,
    });
  }

  if (d.sendMode === "full" || d.sendMode === "provisional") {
    const provisional = d.sendMode === "provisional";
    await prisma.event.update({
      where: { id: event.id },
      data: {
        status: provisional ? "PROVISIONAL_FUNCTION_SHEET_SENT" : "FUNCTION_SHEET_SENT",
        functionSheetSentAt: new Date(),
      },
    });
    await sendFunctionSheetNotifications(event.id, actor.id, provisional);
  }

  return { ok: true, id: event.id };
}

async function sendFunctionSheetNotifications(eventId: string, actorId: string, provisional = false) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      departments: {
        include: { department: { include: { members: { where: { isManager: true } } } } },
      },
    },
  });
  if (!event) return;

  const managerIds = [
    ...new Set(
      event.departments.flatMap((ed) => ed.department.members.map((m) => m.userId)),
    ),
  ];

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${appUrl}/events/${eventId}`;

  const docLabel = provisional ? "Provisional function sheet" : "Function sheet";
  const provisionalNote = provisional
    ? " This is a provisional sheet — details may change before the final version is issued."
    : "";

  await notify({
    userIds: managerIds,
    type: "FUNCTION_SHEET_SENT",
    title: `${docLabel} sent: ${event.title}`,
    body: `Event date: ${event.eventDate.toLocaleDateString()}${provisionalNote}`,
    eventId,
    url,
    sendEmail: true,
    emailSubject: `[BIC] ${docLabel}: ${event.title}`,
    emailText: `The ${docLabel.toLowerCase()} for "${event.title}" (${event.eventDate.toLocaleDateString()}) has been sent to your department.${provisionalNote}\n\nView it: ${url}`,
    emailHtml: `<p>The ${docLabel.toLowerCase()} for <strong>${event.title}</strong> (${event.eventDate.toLocaleDateString()}) has been sent to your department.${provisional ? " <strong>This is provisional and may be updated.</strong>" : ""}</p><p><a href="${url}">View the function sheet</a></p>`,
  });

  await logAudit({ actorId, action: "SEND_FUNCTION_SHEET", entityType: "Event", entityId: eventId, eventId });
}

export async function notifyFunctionSheetUpdated(eventId: string, changeDesc: string, actorId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      departments: {
        include: { department: { include: { members: { where: { isManager: true } } } } },
      },
    },
  });
  if (!event) return;

  const managerIds = [
    ...new Set(event.departments.flatMap((ed) => ed.department.members.map((m) => m.userId))),
  ];

  // Write FUNCTION_SHEET_UPDATED rows (not immediate email — digest cron handles those)
  await prisma.notification.createMany({
    data: managerIds.map((userId) => ({
      userId,
      type: "FUNCTION_SHEET_UPDATED" as const,
      title: changeDesc,
      body: `${event.title} was updated. View the latest version.`,
      eventId,
      url: `${process.env.APP_URL ?? "http://localhost:3000"}/events/${eventId}`,
      emailedAt: null,
    })),
  });
}

export async function deleteEventAction(eventId: string): Promise<ActionResult> {
  const actor = await requireSession();
  if (!canDeleteEvent(actor)) return { ok: false, error: "Not allowed." };

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: "Not found." };

  await prisma.event.delete({ where: { id: eventId } });
  await logAudit({ actorId: actor.id, action: "DELETE", entityType: "Event", entityId: eventId, eventId });

  revalidatePath("/events");
  return { ok: true };
}

export type ReadinessCheck = { label: string; passed: boolean; detail?: string };
export type ReadinessResult =
  | { ok: true; allPassed: boolean; checks: ReadinessCheck[] }
  | { ok: false; error: string };

export async function checkEventReadinessAction(eventId: string): Promise<ReadinessResult> {
  const actor = await requireSession();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      departments: {
        include: { requirements: { select: { id: true } } },
      },
    },
  });
  if (!event) return { ok: false, error: "Event not found." };
  if (!canEditEvent(actor, event)) return { ok: false, error: "Not allowed." };

  const checks: ReadinessCheck[] = [];

  checks.push({
    label: "Coordinator assigned",
    passed: !!event.coordinatorId,
    detail: event.coordinatorId ? undefined : "Assign a coordinator before sending.",
  });

  const deptCount = event.departments.length;
  checks.push({
    label: "At least one department assigned",
    passed: deptCount > 0,
    detail: deptCount > 0 ? undefined : "Add departments via the Departments tab.",
  });

  const deptsWithNoReqs = event.departments.filter((d) => d.requirements.length === 0);
  checks.push({
    label: "All departments have requirements",
    passed: deptsWithNoReqs.length === 0,
    detail:
      deptsWithNoReqs.length > 0
        ? `${deptsWithNoReqs.length} department(s) have no requirements entered.`
        : undefined,
  });

  const ts = (d: Date) => d.getTime();
  const windowsOk =
    ts(event.setupStart) < ts(event.setupEnd) &&
    ts(event.setupEnd) <= ts(event.liveStart) &&
    ts(event.liveStart) < ts(event.liveEnd) &&
    ts(event.liveEnd) <= ts(event.breakdownStart) &&
    ts(event.breakdownStart) < ts(event.breakdownEnd);
  checks.push({
    label: "Time windows are valid",
    passed: windowsOk,
    detail: windowsOk ? undefined : "Fix the time window ordering in event settings.",
  });

  return { ok: true, allPassed: checks.every((c) => c.passed), checks };
}

export async function duplicateEventAction(
  sourceEventId: string,
  newTitle: string,
  newDate: string,
): Promise<ActionResult> {
  const actor = await requireSession();
  if (!canCreateEvent(actor)) return { ok: false, error: "Not allowed." };

  const source = await prisma.event.findUnique({
    where: { id: sourceEventId },
    include: {
      departments: {
        include: {
          requirements: { orderBy: { sortOrder: "asc" } },
        },
      },
      eventVenues: { select: { venueId: true } },
    },
  });
  if (!source) return { ok: false, error: "Source event not found." };

  const title = newTitle.trim();
  if (title.length < 2) return { ok: false, error: "Title must be at least 2 characters." };
  const eventDate = new Date(newDate);
  if (isNaN(eventDate.getTime())) return { ok: false, error: "Invalid event date." };

  // Compute time offsets relative to the original eventDate, apply to new date
  const offsetMs = eventDate.getTime() - source.eventDate.getTime();
  const shiftDate = (d: Date) => new Date(d.getTime() + offsetMs);

  const newEvent = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title,
        status: "DRAFT",
        eventDate,
        coordinatorId: source.coordinatorId,
        salespersonName: source.salespersonName,
        maximizerNumber: source.maximizerNumber,
        isVip: source.isVip,
        estimatedGuests: source.estimatedGuests,
        clientName: source.clientName,
        clientContact: source.clientContact,
        setupStart: shiftDate(source.setupStart),
        setupEnd: shiftDate(source.setupEnd),
        liveStart: shiftDate(source.liveStart),
        liveEnd: shiftDate(source.liveEnd),
        breakdownStart: shiftDate(source.breakdownStart),
        breakdownEnd: shiftDate(source.breakdownEnd),
        createdById: actor.id,
      },
    });

    // Clone venue assignments
    if (source.eventVenues.length > 0) {
      await tx.eventVenue.createMany({
        data: source.eventVenues.map((v) => ({ eventId: created.id, venueId: v.venueId })),
      });
    }

    // Clone departments and their requirements
    for (const ed of source.departments) {
      const newEd = await tx.eventDepartment.create({
        data: { eventId: created.id, departmentId: ed.departmentId },
      });
      if (ed.requirements.length > 0) {
        await tx.departmentRequirement.createMany({
          data: ed.requirements.map((r) => ({
            eventId: created.id,
            departmentId: r.departmentId,
            eventDepartmentId: newEd.id,
            description: r.description,
            priority: r.priority,
            sortOrder: r.sortOrder,
            updatedById: actor.id,
          })),
        });
      }
    }

    return created;
  });

  await logAudit({
    actorId: actor.id,
    action: "CREATE",
    entityType: "Event",
    entityId: newEvent.id,
    eventId: newEvent.id,
    message: `Duplicated from event ${sourceEventId}`,
  });

  revalidatePath("/events");
  return { ok: true, id: newEvent.id };
}

export async function getRequirementTemplatesAction(
  eventType: string,
): Promise<{ ok: true; templates: Record<string, string> } | { ok: false; error: string }> {
  if (!eventType) return { ok: true, templates: {} };
  const records = await prisma.requirementTemplate.findMany({
    where: { eventType },
    select: { departmentName: true, items: true },
  });
  const templates: Record<string, string> = {};
  for (const r of records) {
    templates[r.departmentName] = r.items.join("\n");
  }
  return { ok: true, templates };
}

export async function quickCreateEventAction(
  title: string,
  eventDateStr: string, // yyyy-MM-dd
  coordinatorId: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await requireSession();
  if (!canCreateEvent(actor)) return { ok: false, error: "Not allowed." };

  if (!title.trim()) return { ok: false, error: "Title is required." };

  const d = new Date(eventDateStr);
  if (isNaN(d.getTime())) return { ok: false, error: "Invalid date." };

  // Default time windows: setup 08–10, live 10–22, breakdown 22–23
  function dt(hours: number, minutes = 0) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, minutes));
  }

  const event = await prisma.event.create({
    data: {
      title: title.trim(),
      eventDate: d,
      coordinatorId: coordinatorId || null,
      setupStart: dt(8),
      setupEnd: dt(10),
      liveStart: dt(10),
      liveEnd: dt(22),
      breakdownStart: dt(22),
      breakdownEnd: dt(23),
      createdById: actor.id,
    },
  });

  await logAudit({ actorId: actor.id, action: "CREATE", entityType: "Event", entityId: event.id, eventId: event.id });

  if (coordinatorId && coordinatorId !== actor.id) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await notify({
      userIds: [coordinatorId],
      type: "EVENT_ASSIGNED",
      title: `You've been assigned as coordinator for: ${event.title}`,
      body: `Event date: ${d.toLocaleDateString()}`,
      eventId: event.id,
      url: `${appUrl}/events/${event.id}`,
      sendEmail: true,
      emailSubject: `[BIC] You're the coordinator for: ${event.title}`,
      emailText: `You've been assigned as event coordinator for "${event.title}" on ${d.toLocaleDateString()}.\n\nView it: ${appUrl}/events/${event.id}`,
      emailHtml: `<p>You've been assigned as event coordinator for <strong>${event.title}</strong> on ${d.toLocaleDateString()}.</p><p><a href="${appUrl}/events/${event.id}">View the event</a></p>`,
    });
  }

  revalidatePath("/calendar");
  revalidatePath("/events");
  return { ok: true, id: event.id };
}
