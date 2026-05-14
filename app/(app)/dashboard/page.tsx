import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin, hasRole, canCreateEvent } from "@/lib/authz";
import type { SessionUser } from "@/lib/authz";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { VipBadge } from "@/components/ui/vip-badge";
import { StatCard } from "@/components/ui/stat-card";
import { format, addDays } from "date-fns";
import type { EventStatus } from "@prisma/client";
import {
  ListChecks,
  Plus,
  ArrowUpRight,
  CalendarX,
} from "lucide-react";

const ACTIVE_STATUSES: EventStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "FUNCTION_SHEET_SENT",
  "IN_SETUP",
  "LIVE",
];

// ── Sub-components ───────────────────────────────────────────────────────────

function EventRow({
  id,
  title,
  eventDate,
  status,
  coordinator,
  guests,
  isVip,
}: {
  id: string;
  title: string;
  eventDate: Date;
  status: EventStatus;
  coordinator?: string | null;
  guests?: number | null;
  isVip?: boolean;
}) {
  return (
    <Link href={`/events/${id}`} className="focus-ring group block rounded-md">
      <div
        className={`glass-subtle flex items-center gap-3 rounded-md px-3 py-2.5 transition-all duration-200 hover:translate-x-0.5 hover:shadow-glass ${
          isVip ? "border-l-4 border-l-vip" : ""
        }`}
      >
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-md ${
            isVip ? "bg-vip/15 text-vip-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          <p className="text-[10px] font-medium uppercase leading-none">
            {format(eventDate, "MMM")}
          </p>
          <p className="text-lg font-bold leading-none tabular-nums">
            {format(eventDate, "d")}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{title}</p>
            {isVip && <VipBadge size="xs" />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {coordinator ?? "No coordinator"}
            {guests ? ` · ${guests} guests` : ""}
          </p>
        </div>
        <StatusBadge status={status} />
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
      </div>
    </Link>
  );
}

function RequirementRow({
  description,
  deptName,
  eventId,
  eventTitle,
  eventDate,
  priority,
}: {
  id: string;
  description: string;
  deptName: string;
  eventId: string;
  eventTitle: string;
  eventDate: Date;
  priority?: string | null;
}) {
  const priorityDot =
    priority === "HIGH" || priority === "URGENT"
      ? "bg-destructive"
      : priority === "MEDIUM"
      ? "bg-accent"
      : "bg-muted-foreground/40";
  return (
    <Link
      href={`/events/${eventId}`}
      className="focus-ring group block rounded-md"
    >
      <div className="glass-subtle flex items-start gap-3 rounded-md px-3 py-2.5 transition-all hover:shadow-glass">
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityDot}`}
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm">{description}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {eventTitle} · {format(eventDate, "d MMM yyyy")}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">
          {deptName}
        </Badge>
      </div>
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted/50 text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function PageHeader({
  greeting,
  subtitle,
  action,
}: {
  greeting: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Dashboard
        </p>
        <h1 className="mt-1 text-display">{greeting}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await auth();
  const u = session!.user as SessionUser;

  const now = new Date();
  const in30 = addDays(now, 30);

  // ── ADMIN / COORDINATOR ──────────────────────────────────────────────────
  if (isAdmin(u) || hasRole(u, "COORDINATOR")) {
    const coordScope = isAdmin(u) ? {} : { coordinatorId: u.id };

    const [upcomingEvents, statusGroups, unassignedReqs, unreadCount, liveCount, unassignedCount] =
      await Promise.all([
        prisma.event.findMany({
          where: {
            ...coordScope,
            eventDate: { gte: now, lte: in30 },
          },
          include: { coordinator: { select: { displayName: true } } },
          orderBy: { eventDate: "asc" },
        }),
        prisma.event.groupBy({
          by: ["status"],
          where: { coordinatorId: u.id },
          _count: { _all: true },
          orderBy: { status: "asc" },
        }),
        prisma.departmentRequirement.findMany({
          where: {
            event: {
              ...coordScope,
              eventDate: { gte: now },
              status: { in: ACTIVE_STATUSES },
            },
            assignments: { none: {} },
          },
          include: {
            event: { select: { id: true, title: true, eventDate: true } },
            department: { select: { name: true } },
          },
          orderBy: { event: { eventDate: "asc" } },
          take: 10,
        }),
        prisma.notification.count({
          where: { userId: u.id, readAt: null },
        }),
        prisma.event.count({
          where: { ...coordScope, status: "LIVE" },
        }),
        prisma.event.count({
          where: { ...coordScope, coordinatorId: null, status: { in: ACTIVE_STATUSES } },
        }),
      ]);

    return (
      <div className="space-y-6">
        <PageHeader
          greeting={`Welcome, ${u.displayName.split(" ")[0]}`}
          subtitle={u.roles.join(" · ")}
          action={
            canCreateEvent(u) && (
              <Button asChild size="sm">
                <Link href="/events/new">
                  <Plus className="h-4 w-4" />
                  New event
                </Link>
              </Button>
            )
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Upcoming (30d)"
            value={upcomingEvents.length}
            sub="Events in the next 30 days"
            tone="primary"
            delay={0}
            href={`/events?dateMin=${now.toISOString().split('T')[0]}&dateMax=${in30.toISOString().split('T')[0]}`}
          />
          <StatCard
            label="Live now"
            value={liveCount}
            sub="Currently running"
            tone="live"
            delay={80}
            href="/events?status=LIVE"
          />
          <StatCard
            label="Unassigned"
            value={unassignedCount}
            sub="Events without coordinator"
            tone="warning"
            delay={160}
            href="/events?unassigned=true"
          />
          <StatCard
            label="Unread alerts"
            value={unreadCount}
            sub="Notifications waiting"
            tone="info"
            delay={240}
            href="/notifications"
          />
        </div>

        {!isAdmin(u) && statusGroups.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">My pipeline</CardTitle>
              <CardDescription>Your events by status — click any to view</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {statusGroups.map((g) => (
                  <Link
                    key={g.status}
                    href={`/events?status=${g.status}`}
                    className="focus-ring inline-flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/60"
                  >
                    <StatusBadge status={g.status} size="md" />
                    <span className="text-sm font-bold tabular-nums">
                      {g._count._all}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Upcoming events</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/events">See all</Link>
                </Button>
              </div>
              <CardDescription>Next 30 days, all statuses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingEvents.length === 0 ? (
                <EmptyState
                  icon={CalendarX}
                  title="No upcoming events"
                  description="Active events scheduled in the next 30 days will appear here."
                  action={
                    canCreateEvent(u) && (
                      <Button asChild size="sm" variant="outline">
                        <Link href="/events/new">Create event</Link>
                      </Button>
                    )
                  }
                />
              ) : (
                upcomingEvents.map((ev) => (
                  <EventRow
                    key={ev.id}
                    id={ev.id}
                    title={ev.title}
                    eventDate={ev.eventDate}
                    status={ev.status}
                    coordinator={ev.coordinator?.displayName}
                    guests={ev.estimatedGuests}
                    isVip={ev.isVip}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Needs attention</CardTitle>
              <CardDescription>Unassigned requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {unassignedReqs.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="All clear"
                  description="Every requirement has an assignee. Nice work."
                />
              ) : (
                unassignedReqs.map((req) => (
                  <RequirementRow
                    key={req.id}
                    id={req.id}
                    description={req.description}
                    deptName={req.department.name}
                    eventId={req.event.id}
                    eventTitle={req.event.title}
                    eventDate={req.event.eventDate}
                    priority={req.priority}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── DEPT_MANAGER ─────────────────────────────────────────────────────────
  if (hasRole(u, "DEPT_MANAGER")) {
    const memberships = await prisma.departmentMember.findMany({
      where: { userId: u.id, isManager: true },
      include: { department: { select: { id: true, name: true } } },
    });
    const deptIds = memberships.map((m) => m.departmentId);
    const deptNames = memberships.map((m) => m.department.name);

    const [upcomingEvents, unassignedReqs, myAssignments] = await Promise.all([
      prisma.event.findMany({
        where: {
          eventDate: { gte: now, lte: in30 },
        },
        include: { coordinator: { select: { displayName: true } } },
        orderBy: { eventDate: "asc" },
      }),
      prisma.departmentRequirement.findMany({
        where: {
          departmentId: { in: deptIds },
          event: {
            eventDate: { gte: now },
            status: { in: ACTIVE_STATUSES },
          },
          assignments: { none: {} },
        },
        include: {
          event: { select: { id: true, title: true, eventDate: true } },
          department: { select: { name: true } },
        },
        orderBy: { event: { eventDate: "asc" } },
        take: 10,
      }),
      prisma.requirementAssignment.findMany({
        where: {
          userId: u.id,
          requirement: {
            event: {
              eventDate: { gte: now },
              status: { in: ACTIVE_STATUSES },
            },
          },
        },
        include: {
          requirement: {
            include: {
              department: { select: { name: true } },
              event: { select: { id: true, title: true, eventDate: true } },
            },
          },
        },
        orderBy: { requirement: { event: { eventDate: "asc" } } },
        take: 10,
      }),
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          greeting={`Welcome, ${u.displayName.split(" ")[0]}`}
          subtitle={`Managing: ${deptNames.join(", ")}`}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Upcoming events"
            value={upcomingEvents.length}
            sub="In your departments"
            tone="primary"
            delay={0}
          />
          <StatCard
            label="Unassigned"
            value={unassignedReqs.length}
            sub="Needing a team member"
            tone="warning"
            delay={80}
          />
          <StatCard
            label="My tasks"
            value={myAssignments.length}
            sub="Assigned to you"
            tone="info"
            delay={160}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Upcoming events</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/events">See all</Link>
                </Button>
              </div>
              <CardDescription>Next 30 days in your departments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingEvents.length === 0 ? (
                <EmptyState
                  icon={CalendarX}
                  title="No upcoming events"
                  description="Events in your departments will appear here."
                />
              ) : (
                upcomingEvents.map((ev) => (
                  <EventRow
                    key={ev.id}
                    id={ev.id}
                    title={ev.title}
                    eventDate={ev.eventDate}
                    status={ev.status}
                    coordinator={ev.coordinator?.displayName}
                    isVip={ev.isVip}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Unassigned requirements</CardTitle>
              <CardDescription>Items needing a team member</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {unassignedReqs.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="All clear"
                  description="Every requirement has an assignee."
                />
              ) : (
                unassignedReqs.map((req) => (
                  <RequirementRow
                    key={req.id}
                    id={req.id}
                    description={req.description}
                    deptName={req.department.name}
                    eventId={req.event.id}
                    eventTitle={req.event.title}
                    eventDate={req.event.eventDate}
                    priority={req.priority}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {myAssignments.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">My assigned tasks</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/my-tasks">See all</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {myAssignments.map((a) => (
                <Link
                  key={a.requirementId}
                  href={`/events/${a.requirement.event.id}`}
                  className="focus-ring block rounded-md"
                >
                  <div className="glass-subtle flex items-start gap-3 rounded-md px-3 py-2.5 transition-all hover:shadow-glass">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm">
                        {a.requirement.description}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.requirement.event.title} ·{" "}
                        {format(a.requirement.event.eventDate, "d MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Badge variant="outline" className="text-xs">
                        {a.requirement.department.name}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── DEPT_TEAM_MEMBER (or no role yet) ────────────────────────────────────
  const assignments = await prisma.requirementAssignment.findMany({
    where: {
      userId: u.id,
      requirement: {
        event: {
          eventDate: { gte: now },
          status: { in: ACTIVE_STATUSES },
        },
      },
    },
    include: {
      requirement: {
        include: {
          department: { select: { name: true } },
          event: {
            select: { id: true, title: true, eventDate: true, status: true },
          },
        },
      },
    },
    orderBy: { requirement: { event: { eventDate: "asc" } } },
  });

  const byEvent = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const key = a.requirement.event.id;
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key)!.push(a);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        greeting={`Welcome, ${u.displayName.split(" ")[0]}`}
        subtitle={
          u.roles.length > 0
            ? u.roles.join(" · ")
            : "No roles assigned — contact an admin"
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Upcoming events"
          value={byEvent.size}
          sub="Events you have tasks in"
          tone="primary"
          delay={0}
        />
        <StatCard
          label="Total tasks"
          value={assignments.length}
          sub="Requirements assigned to you"
          tone="info"
          delay={80}
        />
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h2">My upcoming tasks</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/my-tasks">See all</Link>
          </Button>
        </div>

        {byEvent.size === 0 ? (
          <Card>
            <CardContent className="p-6">
              <EmptyState
                icon={ListChecks}
                title="Nothing on your plate"
                description="Tasks assigned to you will appear here."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {[...byEvent.entries()].map(([, items]) => {
              const ev = items[0].requirement.event;
              return (
                <Card key={ev.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="truncate text-base">
                        {ev.title}
                      </CardTitle>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={ev.status} />
                        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                          {format(ev.eventDate, "d MMM yyyy")}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map((a) => (
                      <Link
                        key={a.requirementId}
                        href={`/events/${ev.id}`}
                        className="focus-ring block rounded-md"
                      >
                        <div className="glass-subtle flex items-start gap-2 rounded-md px-3 py-2 transition-all hover:shadow-glass">
                          <p className="line-clamp-2 flex-1 text-sm">
                            {a.requirement.description}
                          </p>
                          <div className="flex shrink-0 gap-1">
                            <Badge variant="outline" className="text-xs">
                              {a.requirement.department.name}
                            </Badge>
                            {a.requirement.priority && (
                              <Badge variant="secondary" className="text-xs">
                                {a.requirement.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
