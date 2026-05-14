import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditEvent } from "@/lib/authz";
import type { SessionUser } from "@/lib/authz";
import { EventForm } from "@/components/events/event-form";
import { InlineDeptRequirements } from "@/components/events/inline-dept-requirements";
import { EventVenueSelector } from "@/components/events/event-venue-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const session = await auth();
  const u = session!.user as SessionUser;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      departments: {
        include: {
          requirements: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { department: { sortOrder: "asc" } },
      },
      eventVenues: true,
    },
  });
  if (!event) notFound();
  if (!canEditEvent(u, event)) redirect(`/events/${eventId}`);

  const [coordinators, allDepts, allVenues] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, roles: { some: { role: "COORDINATOR" } } },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.venue.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const initialDepts = event.departments.map((ed) => ({
    deptId: ed.departmentId,
    requirements: ed.requirements.map((r) => ({
      id: r.id,
      description: r.description,
      priority: r.priority,
      sortOrder: r.sortOrder,
    })),
  }));

  const initialVenueIds = event.eventVenues.map((ev) => ev.venueId);

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Edit event</h1>

      <EventForm coordinators={coordinators} existing={event} showBackButton={true} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Departments &amp; Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <InlineDeptRequirements
            eventId={eventId}
            allDepts={allDepts}
            initialDepts={initialDepts}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Venues</CardTitle>
        </CardHeader>
        <CardContent>
          <EventVenueSelector
            eventId={eventId}
            allVenues={allVenues}
            initialVenueIds={initialVenueIds}
          />
        </CardContent>
      </Card>
    </div>
  );
}
