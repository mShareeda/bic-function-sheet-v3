"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEventAction, updateEventAction } from "@/server/actions/events";
import { format } from "date-fns";

type Coordinator = { id: string; displayName: string };
type EventData = {
  id: string; title: string; eventDate: Date; confirmationReceived: Date | null;
  coordinatorId: string | null; salespersonName: string | null; maximizerNumber: string | null;
  isVip: boolean; estimatedGuests: number | null; clientName: string | null; clientContact: string | null;
  setupStart: Date; setupEnd: Date; liveStart: Date; liveEnd: Date;
  breakdownStart: Date; breakdownEnd: Date;
};

function toLocalISOString(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDateTime(offsetDays = 0, hours = 9) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hours, 0, 0, 0);
  return toLocalISOString(d);
}

export function EventForm({
  coordinators,
  existing,
  showBackButton = false,
}: {
  coordinators: Coordinator[];
  existing?: EventData;
  showBackButton?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function validateTimeWindows(fd: FormData): string | null {
    const fields = ["setupStart", "setupEnd", "liveStart", "liveEnd", "breakdownStart", "breakdownEnd"] as const;
    const [ss, se, ls, le, bs, be] = fields.map((f) => new Date(fd.get(f) as string).getTime());
    if (isNaN(ss) || isNaN(se) || isNaN(ls) || isNaN(le) || isNaN(bs) || isNaN(be)) return null;
    if (ss >= se) return "Setup start must be before setup end.";
    if (se > ls) return "Setup end must not be after live start.";
    if (ls >= le) return "Live start must be before live end.";
    if (le > bs) return "Live end must not be after breakdown start.";
    if (bs >= be) return "Breakdown start must be before breakdown end.";
    return null;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const timeError = validateTimeWindows(fd);
    if (timeError) { setError(timeError); return; }
    startTransition(async () => {
      const r = existing
        ? await updateEventAction(existing.id, fd)
        : await createEventAction(fd);
      if (r && !r.ok) setError(r.error);
    });
  }

  const ev = existing;

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Event title *</Label>
          <Input id="title" name="title" defaultValue={ev?.title} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="eventDate">Event date *</Label>
          <Input id="eventDate" name="eventDate" type="date"
            defaultValue={ev ? format(ev.eventDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmationReceived">Confirmation received</Label>
          <Input id="confirmationReceived" name="confirmationReceived" type="date"
            defaultValue={ev?.confirmationReceived ? format(ev.confirmationReceived, "yyyy-MM-dd") : ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coordinatorId">Coordinator</Label>
          <select id="coordinatorId" name="coordinatorId"
            className="h-10 w-full rounded-md border border-input px-3 text-sm"
            defaultValue={ev?.coordinatorId ?? ""}>
            <option value="">— unassigned —</option>
            {coordinators.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="salespersonName">Salesperson</Label>
          <Input id="salespersonName" name="salespersonName" defaultValue={ev?.salespersonName ?? ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="maximizerNumber">Maximizer number</Label>
          <Input id="maximizerNumber" name="maximizerNumber" defaultValue={ev?.maximizerNumber ?? ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="estimatedGuests">Estimated guests</Label>
          <Input id="estimatedGuests" name="estimatedGuests" type="number" min={0}
            defaultValue={ev?.estimatedGuests ?? ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientName">Client name</Label>
          <Input id="clientName" name="clientName" defaultValue={ev?.clientName ?? ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientContact">Client contact</Label>
          <Input id="clientContact" name="clientContact" defaultValue={ev?.clientContact ?? ""} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" name="isVip" value="true" defaultChecked={ev?.isVip} />
            VIP / Dignitary event
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Time windows</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: "Setup start", name: "setupStart", def: ev?.setupStart ? toLocalISOString(ev.setupStart) : defaultDateTime(1, 6) },
            { label: "Setup end", name: "setupEnd", def: ev?.setupEnd ? toLocalISOString(ev.setupEnd) : defaultDateTime(1, 17) },
            { label: "Live start", name: "liveStart", def: ev?.liveStart ? toLocalISOString(ev.liveStart) : defaultDateTime(1, 19) },
            { label: "Live end", name: "liveEnd", def: ev?.liveEnd ? toLocalISOString(ev.liveEnd) : defaultDateTime(1, 23) },
            { label: "Breakdown start", name: "breakdownStart", def: ev?.breakdownStart ? toLocalISOString(ev.breakdownStart) : defaultDateTime(1, 23) },
            { label: "Breakdown end", name: "breakdownEnd", def: ev?.breakdownEnd ? toLocalISOString(ev.breakdownEnd) : defaultDateTime(2, 2) },
          ].map(({ label, name, def }) => (
            <div key={name} className="space-y-2">
              <Label htmlFor={name}>{label} *</Label>
              <Input id={name} name={name} type="datetime-local" defaultValue={def} required />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        {showBackButton && (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={pending}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : existing ? "Save changes" : "Create event"}
        </Button>
      </div>
    </form>
  );
}
