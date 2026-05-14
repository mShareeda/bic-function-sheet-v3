"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Star,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createEventCompleteAction } from "@/server/actions/events";


type Coordinator = { id: string; displayName: string };
type Venue = { id: string; name: string };
type Department = { id: string; name: string };

type AgendaDraft = {
  key: string;
  description: string;
  startTime: string;
  endTime: string;
  venueId: string;
  venueText: string;
};

type DeptDraft = {
  departmentId: string;
  requirements: string;
};

type WizardState = {
  // step 1
  title: string;
  eventDate: string;
  eventDateTime: string;
  confirmationReceived: string;
  coordinatorId: string;
  salespersonName: string;
  maximizerNumber: string;
  estimatedGuests: string;
  clientName: string;
  clientContact: string;
  isVip: boolean;
  // step 2
  setupStart: string;
  setupEnd: string;
  liveStart: string;
  liveEnd: string;
  breakdownStart: string;
  breakdownEnd: string;
  // step 3
  agenda: AgendaDraft[];
  // step 4
  venueIds: string[];
  // step 5
  departments: DeptDraft[];
};

const STEPS = [
  { key: "details", label: "Event details" },
  { key: "schedule", label: "Schedule" },
  { key: "agenda", label: "Agenda" },
  { key: "venues", label: "Venues" },
  { key: "departments", label: "Departments" },
  { key: "review", label: "Review" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function newAgendaItem(eventDate: string): AgendaDraft {
  const baseDate = eventDate || toLocalDate(new Date());
  const stamp = `${baseDate}T00:00`;
  return {
    key: crypto.randomUUID(),
    description: "",
    startTime: stamp,
    endTime: stamp,
    venueId: "",
    venueText: "",
  };
}

export function EventWizard({
  coordinators,
  venues,
  departments,
}: {
  coordinators: Coordinator[];
  venues: Venue[];
  departments: Department[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = React.useState<StepKey>("details");
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const today = toLocalDate(new Date());
  const todayMidnight = `${today}T00:00`;
  const [state, setState] = React.useState<WizardState>(() => ({
    title: "",
    eventDate: today,
    eventDateTime: todayMidnight,
    confirmationReceived: todayMidnight,
    coordinatorId: "",
    salespersonName: "",
    maximizerNumber: "",
    estimatedGuests: "",
    clientName: "",
    clientContact: "",
    isVip: false,
    setupStart: todayMidnight,
    setupEnd: todayMidnight,
    liveStart: todayMidnight,
    liveEnd: todayMidnight,
    breakdownStart: todayMidnight,
    breakdownEnd: todayMidnight,
    agenda: [],
    venueIds: [],
    departments: [],
  }));

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function validateStep(target: StepKey): Record<string, string> {
    const e: Record<string, string> = {};
    if (target === "details" || stepIndex >= 0) {
      if (!state.title.trim()) e.title = "Title is required.";
      if (!state.eventDateTime) e.eventDateTime = "Event date/time is required.";
    }
    if (target !== "details") {
      if (!state.setupStart || !state.setupEnd)
        e.setup = "Setup window is required.";
      if (!state.liveStart || !state.liveEnd) e.live = "Live window is required.";
      if (!state.breakdownStart || !state.breakdownEnd)
        e.breakdown = "Breakdown window is required.";
      if (state.setupStart && state.setupEnd && state.liveStart && state.liveEnd && state.breakdownStart && state.breakdownEnd) {
        const ts = (s: string) => new Date(s).getTime();
        const [ss, se, ls, le, bs, be] = [state.setupStart, state.setupEnd, state.liveStart, state.liveEnd, state.breakdownStart, state.breakdownEnd].map(ts);
        if (ss >= se) e.setup = "Setup start must be before setup end.";
        else if (se > ls) e.setup = "Setup end must not be after live start.";
        if (ls >= le) e.live = "Live start must be before live end.";
        else if (le > bs) e.live = "Live end must not be after breakdown start.";
        if (bs >= be) e.breakdown = "Breakdown start must be before breakdown end.";
      }
    }
    return e;
  }

  function goNext() {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const nextIdx = Math.min(stepIndex + 1, STEPS.length - 1);
    setStep(STEPS[nextIdx].key);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function goBack() {
    setErrors({});
    const prevIdx = Math.max(stepIndex - 1, 0);
    setStep(STEPS[prevIdx].key);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function jumpTo(target: StepKey) {
    const targetIdx = STEPS.findIndex((s) => s.key === target);
    if (targetIdx <= stepIndex) {
      setStep(target);
      setErrors({});
      return;
    }
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep(target);
  }

  type SendMode = "draft" | "full" | "provisional";

  function buildPayload(sendMode: SendMode) {
    return {
      title: state.title.trim(),
      eventDate: state.eventDateTime,
      confirmationReceived: state.confirmationReceived || null,
      coordinatorId: state.coordinatorId || null,
      salespersonName: state.salespersonName || null,
      maximizerNumber: state.maximizerNumber || null,
      isVip: state.isVip,
      estimatedGuests: state.estimatedGuests
        ? parseInt(state.estimatedGuests, 10)
        : null,
      clientName: state.clientName || null,
      clientContact: state.clientContact || null,
      setupStart: state.setupStart,
      setupEnd: state.setupEnd,
      liveStart: state.liveStart,
      liveEnd: state.liveEnd,
      breakdownStart: state.breakdownStart,
      breakdownEnd: state.breakdownEnd,
      venueIds: state.venueIds,
      agenda: state.agenda
        .filter((a) => a.description.trim())
        .map((a) => ({
          description: a.description,
          startTime: a.startTime,
          endTime: a.endTime,
          venueId: a.venueId || null,
          venueText: a.venueText || null,
        })),
      departments: state.departments.map((d) => ({
        departmentId: d.departmentId,
        requirements: d.requirements,
      })),
      sendMode,
    };
  }

  function submit(sendMode: SendMode) {
    const e = validateStep("review");
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setStep("schedule");
      return;
    }
    startTransition(async () => {
      const result = await createEventCompleteAction(buildPayload(sendMode));
      if (!result.ok) {
        toast({ kind: "error", title: "Could not create event", description: result.error });
        return;
      }
      const titles: Record<SendMode, string> = {
        draft: "Event saved as draft",
        full: "Function sheet sent",
        provisional: "Provisional function sheet sent",
      };
      toast({ kind: "success", title: titles[sendMode], description: state.title });
      router.push(`/events/${result.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <Stepper current={stepIndex} onJump={(idx) => jumpTo(STEPS[idx].key)} />

      <Card>
        <CardContent className="p-6 space-y-6">
          {step === "details" && (
            <DetailsStep
              state={state}
              set={set}
              coordinators={coordinators}
              errors={errors}
            />
          )}
          {step === "schedule" && (
            <ScheduleStep state={state} set={set} errors={errors} />
          )}
          {step === "agenda" && (
            <AgendaStep
              state={state}
              set={set}
              venues={venues}
              onAdd={() =>
                set("agenda", [...state.agenda, newAgendaItem(state.eventDate)])
              }
            />
          )}
          {step === "venues" && (
            <VenuesStep
              state={state}
              set={set}
              venues={venues}
            />
          )}
          {step === "departments" && (
            <DepartmentsStep
              state={state}
              set={set}
              departments={departments}
            />
          )}
          {step === "review" && (
            <ReviewStep
              state={state}
              coordinators={coordinators}
              venues={venues}
              departments={departments}
            />
          )}

          {Object.keys(errors).length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <ul className="space-y-0.5">
                {Object.values(errors).map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={(stepIndex === 0 || pending) && step !== "review"}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step === "review" && (
            <Button
              variant="outline"
              onClick={() => router.back()}
              disabled={pending}
            >
              <ChevronLeft className="h-4 w-4" /> Go back
            </Button>
          )}
        </div>

        {step !== "review" ? (
          <Button onClick={goNext} disabled={pending}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => submit("draft")}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save as draft
            </Button>
            <Button
              variant="secondary"
              onClick={() => submit("provisional")}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Send provisional sheet
            </Button>
            <Button onClick={() => submit("full")} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Send function sheet
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({
  current,
  onJump,
}: {
  current: number;
  onJump: (idx: number) => void;
}) {
  return (
    <nav aria-label="Progress" className="glass rounded-md p-3">
      <ol className="flex items-center gap-2 overflow-x-auto">
        {STEPS.map((s, i) => {
          const state =
            i < current ? "done" : i === current ? "active" : "upcoming";
          return (
            <li key={s.key} className="flex flex-1 items-center min-w-fit">
              <button
                type="button"
                onClick={() => onJump(i)}
                className={cn(
                  "focus-ring flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  state === "active" && "bg-primary text-primary-foreground",
                  state === "done" && "text-status-live hover:bg-surface/60",
                  state === "upcoming" && "text-muted-foreground hover:bg-surface/60",
                )}
              >
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold",
                    state === "active" && "border-primary-foreground/40 bg-primary-foreground/15",
                    state === "done" && "border-status-live/40 bg-status-live/10",
                    state === "upcoming" && "border-border",
                  )}
                >
                  {state === "done" ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="mx-1 hidden h-px flex-1 bg-border/60 sm:block" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Step 1: Details ──────────────────────────────────────────────────────────

function DetailsStep({
  state,
  set,
  coordinators,
  errors,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  coordinators: Coordinator[];
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      <StepHeader
        title="Event details"
        description="Core info about the booking. You can refine this later."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event name" required full error={errors.title}>
          <Input
            value={state.title}
            onChange={(e) => set("title", e.target.value)}
            required
          />
        </Field>
        <Field label="Event date & time" required error={errors.eventDateTime}>
          <Input
            type="datetime-local"
            value={state.eventDateTime}
            onChange={(e) => {
              set("eventDateTime", e.target.value);
              if (e.target.value)
                set("eventDate", e.target.value.split("T")[0] ?? "");
            }}
            required
          />
        </Field>
        <Field label="Confirmation date & time">
          <Input
            type="datetime-local"
            value={state.confirmationReceived}
            onChange={(e) => set("confirmationReceived", e.target.value)}
          />
        </Field>
        <Field label="Coordinator">
          <SelectNative
            value={state.coordinatorId}
            onChange={(v) => set("coordinatorId", v)}
            options={[
              { value: "", label: "— unassigned —" },
              ...coordinators.map((c) => ({
                value: c.id,
                label: c.displayName,
              })),
            ]}
          />
        </Field>
        <Field label="Salesperson">
          <Input
            value={state.salespersonName}
            onChange={(e) => set("salespersonName", e.target.value)}
          />
        </Field>
        <Field label="Maximizer number">
          <Input
            value={state.maximizerNumber}
            onChange={(e) => set("maximizerNumber", e.target.value)}
          />
        </Field>
        <Field label="Estimated guests">
          <Input
            type="number"
            min={0}
            value={state.estimatedGuests}
            onChange={(e) => set("estimatedGuests", e.target.value)}
          />
        </Field>
        <Field label="Client name">
          <Input
            value={state.clientName}
            onChange={(e) => set("clientName", e.target.value)}
          />
        </Field>
        <Field label="Client contact">
          <Input
            value={state.clientContact}
            onChange={(e) => set("clientContact", e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <label className="glass-subtle flex cursor-pointer items-center gap-3 rounded-md p-3">
            <input
              type="checkbox"
              checked={state.isVip}
              onChange={(e) => set("isVip", e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="flex items-center gap-2 text-sm font-medium">
              <Star className="h-4 w-4 text-accent" />
              VIP / Dignitary event
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Schedule ─────────────────────────────────────────────────────────

function ScheduleStep({
  state,
  set,
  errors,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      <StepHeader
        title="Schedule"
        description="Define the setup, live event, and breakdown windows."
      />
      <div className="space-y-4">
        <ScheduleBlock
          label="Setup"
          tone="primary"
          start={state.setupStart}
          end={state.setupEnd}
          onStart={(v) => set("setupStart", v)}
          onEnd={(v) => set("setupEnd", v)}
          error={errors.setup}
        />
        <ScheduleBlock
          label="Live event"
          tone="live"
          start={state.liveStart}
          end={state.liveEnd}
          onStart={(v) => set("liveStart", v)}
          onEnd={(v) => set("liveEnd", v)}
          error={errors.live}
        />
        <ScheduleBlock
          label="Breakdown"
          tone="muted"
          start={state.breakdownStart}
          end={state.breakdownEnd}
          onStart={(v) => set("breakdownStart", v)}
          onEnd={(v) => set("breakdownEnd", v)}
          error={errors.breakdown}
        />
      </div>
    </div>
  );
}

function ScheduleBlock({
  label,
  tone,
  start,
  end,
  onStart,
  onEnd,
  error,
}: {
  label: string;
  tone: "primary" | "live" | "muted";
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  error?: string;
}) {
  const dotClass = {
    primary: "bg-primary",
    live: "bg-status-live",
    muted: "bg-muted-foreground/40",
  }[tone];
  return (
    <div className="glass-subtle rounded-md p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        <h4 className="text-sm font-semibold uppercase tracking-wide">
          {label}
        </h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start">
          <Input
            type="datetime-local"
            value={start}
            onChange={(e) => onStart(e.target.value)}
          />
        </Field>
        <Field label="Finish">
          <Input
            type="datetime-local"
            value={end}
            onChange={(e) => onEnd(e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Step 3: Agenda ───────────────────────────────────────────────────────────

function AgendaStep({
  state,
  set,
  venues,
  onAdd,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  venues: Venue[];
  onAdd: () => void;
}) {
  function update(key: string, patch: Partial<AgendaDraft>) {
    set(
      "agenda",
      state.agenda.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    );
  }
  function remove(key: string) {
    set(
      "agenda",
      state.agenda.filter((a) => a.key !== key),
    );
  }

  return (
    <div className="space-y-5">
      <StepHeader
        title="Agenda"
        description="Add the running order. Each item needs a description, time window, and venue."
      />

      {state.agenda.length === 0 && (
        <div className="glass-subtle rounded-md p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No agenda items yet. Add the first one to get started.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {state.agenda.map((item, i) => (
          <div key={item.key} className="glass-subtle rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Item {i + 1}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove agenda item"
                onClick={() => remove(item.key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Field label="Description" required>
              <Input
                value={item.description}
                onChange={(e) =>
                  update(item.key, { description: e.target.value })
                }
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date & time">
                <Input
                  type="datetime-local"
                  value={item.startTime}
                  onChange={(e) =>
                    update(item.key, { startTime: e.target.value })
                  }
                />
              </Field>
              <Field label="Finish date & time">
                <Input
                  type="datetime-local"
                  value={item.endTime}
                  onChange={(e) =>
                    update(item.key, { endTime: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Venue">
                <SelectNative
                  value={item.venueId}
                  onChange={(v) =>
                    update(item.key, { venueId: v, venueText: "" })
                  }
                  options={[
                    { value: "", label: "— choose venue —" },
                    ...venues.map((v) => ({ value: v.id, label: v.name })),
                  ]}
                />
              </Field>
              <Field label="Or custom venue">
                <Input
                  value={item.venueText}
                  onChange={(e) =>
                    update(item.key, { venueText: e.target.value, venueId: "" })
                  }
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={onAdd} className="w-full sm:w-auto">
        <Plus className="h-4 w-4" /> Add agenda item
      </Button>
    </div>
  );
}

// ── Step 4: Venues ───────────────────────────────────────────────────────────

function VenuesStep({
  state,
  set,
  venues,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  venues: Venue[];
}) {
  function toggle(venueId: string) {
    if (state.venueIds.includes(venueId)) {
      set("venueIds", state.venueIds.filter((id) => id !== venueId));
    } else {
      set("venueIds", [...state.venueIds, venueId]);
    }
  }

  return (
    <div className="space-y-5">
      <StepHeader
        title="Event venues"
        description="Select the venues where this event will take place."
      />

      {venues.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No venues configured. Ask an admin to add some.
        </p>
      ) : (
        <div className="space-y-2">
          {venues.map((v) => {
            const selected = state.venueIds.includes(v.id);
            return (
              <label
                key={v.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors",
                  selected ? "border-primary/50 bg-primary/5" : "border-border/50 bg-surface/30",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(v.id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm font-medium">{v.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 5: Departments + Requirements ───────────────────────────────────────

function DepartmentsStep({
  state,
  set,
  departments,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  departments: Department[];
}) {
  function toggle(deptId: string) {
    const exists = state.departments.find((d) => d.departmentId === deptId);
    if (exists) {
      set("departments", state.departments.filter((d) => d.departmentId !== deptId));
    } else {
      set("departments", [...state.departments, { departmentId: deptId, requirements: "" }]);
    }
  }

  function updateReq(deptId: string, value: string) {
    set(
      "departments",
      state.departments.map((d) =>
        d.departmentId === deptId ? { ...d, requirements: value } : d,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <StepHeader
        title="Departments"
        description="Pick which departments are involved, then describe what each one needs to deliver."
      />

      {departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active departments configured. Ask an admin to add some.
        </p>
      ) : (
        <div className="space-y-3">
          {departments.map((d) => {
            const sel = state.departments.find((sd) => sd.departmentId === d.id);
            const selected = !!sel;
            return (
              <div
                key={d.id}
                className={cn(
                  "rounded-md border transition-colors",
                  selected ? "border-primary/50 bg-primary/5" : "border-border/50 bg-surface/30",
                )}
              >
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(d.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="flex-1 text-sm font-semibold">{d.name}</span>
                </label>
                {selected && (
                  <div className="border-t border-border/40 p-4 pt-3">
                    <Label
                      htmlFor={`req-${d.id}`}
                      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Requirements / brief for {d.name}
                    </Label>
                    <textarea
                      id={`req-${d.id}`}
                      value={sel?.requirements ?? ""}
                      onChange={(e) => updateReq(d.id, e.target.value)}
                      rows={4}
                      className="mt-1.5 w-full rounded-md border border-border/60 bg-surface/50 backdrop-blur-glass px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 5: Review ───────────────────────────────────────────────────────────

function ReviewStep({
  state,
  coordinators,
  venues,
  departments,
}: {
  state: WizardState;
  coordinators: Coordinator[];
  venues: Venue[];
  departments: Department[];
}) {
  const coordName =
    coordinators.find((c) => c.id === state.coordinatorId)?.displayName ??
    "Unassigned";
  const venueName = (id: string) => venues.find((v) => v.id === id)?.name;
  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const facts: [string, string][] = [
    ["Event date/time", fmtDateTime(state.eventDateTime)],
    [
      "Confirmation",
      state.confirmationReceived
        ? fmtDateTime(state.confirmationReceived)
        : "—",
    ],
    ["Coordinator", coordName],
    ["Salesperson", state.salespersonName || "—"],
    ["Maximizer #", state.maximizerNumber || "—"],
    ["Estimated guests", state.estimatedGuests || "—"],
    ["Client", state.clientName || "—"],
    ["Client contact", state.clientContact || "—"],
    ["VIP", state.isVip ? "Yes" : "No"],
  ];

  return (
    <div className="space-y-6">
      <StepHeader
        title="Review & publish"
        description="Double-check everything before publishing. Save as draft, or send the provisional or final function sheet to all department managers."
      />

      <Section title={state.title || "Untitled event"}>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {k}
              </dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Schedule">
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          {(
            [
              ["Setup", state.setupStart, state.setupEnd],
              ["Live event", state.liveStart, state.liveEnd],
              ["Breakdown", state.breakdownStart, state.breakdownEnd],
            ] as [string, string, string][]
          ).map(([label, s, e]) => (
            <div key={label} className="glass-subtle rounded-md p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
              </dt>
              <dd className="font-semibold tabular-nums">
                {fmtDateTime(s)} → {fmtDateTime(e)}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={`Agenda (${state.agenda.filter((a) => a.description.trim()).length})`}>
        {state.agenda.filter((a) => a.description.trim()).length === 0 ? (
          <p className="text-sm text-muted-foreground">No agenda items.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {state.agenda
              .filter((a) => a.description.trim())
              .map((a, i) => (
                <li
                  key={a.key}
                  className="glass-subtle flex flex-wrap items-start gap-3 rounded-md p-3"
                >
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {i + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {fmtDateTime(a.startTime)} → {fmtDateTime(a.endTime)}
                      {(a.venueId || a.venueText) &&
                        ` · ${venueName(a.venueId) ?? a.venueText}`}
                    </p>
                  </div>
                </li>
              ))}
          </ol>
        )}
      </Section>

      <Section title={`Departments (${state.departments.length})`}>
        {state.departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No departments selected.
          </p>
        ) : (
          <div className="space-y-3">
            {state.departments.map((d) => (
              <div key={d.departmentId} className="glass-subtle rounded-md p-3">
                <p className="font-semibold text-sm">{deptName(d.departmentId)}</p>
                {d.requirements?.trim() ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {d.requirements}
                  </p>
                ) : (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    No requirement text yet.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function StepHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-h2">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({
  label,
  required,
  full,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <Label className="text-xs font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SelectNative({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-border/60 bg-surface/50 backdrop-blur-glass px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function fmtDateTime(s: string) {
  if (!s) return "—";
  try {
    return format(new Date(s), "d MMM yyyy HH:mm");
  } catch {
    return s;
  }
}
