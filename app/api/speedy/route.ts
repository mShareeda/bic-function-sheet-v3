import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toZonedTime, format } from "date-fns-tz";

export const dynamic = "force-dynamic";

const TZ = process.env.APP_TIMEZONE ?? "Asia/Bahrain";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function parseUserQuery(query: string): string {
  const lower = query.toLowerCase().trim();

  if (lower.includes("help") || lower.includes("how do i") || lower.includes("how to")) {
    return "help";
  }
  if (lower.includes("what") && (lower.includes("event") || lower.includes("coming") || lower.includes("upcoming"))) {
    return "events";
  }
  if (lower.includes("department")) {
    return "departments";
  }
  if (lower.includes("venue") || lower.includes("location")) {
    return "venues";
  }
  if (lower.includes("staff") || lower.includes("coordinator") || lower.includes("member") || lower.includes("team")) {
    return "staff";
  }
  if (lower.includes("status") && lower.includes("event")) {
    return "event_status";
  }
  return "general";
}

async function generateResponse(
  queryType: string,
  userQuery: string,
  context: {
    events: Array<{
      title: string;
      status: string;
      eventDate: Date;
      coordinator: { displayName: string } | null;
      departments: Array<{ department: { name: string } }>;
      eventVenues: Array<{ venue: { name: string } }>;
    }>;
    departments: Array<{ name: string }>;
    venues: Array<{ name: string }>;
    users: Array<{ displayName: string; roles: Array<{ role: string }> }>;
    datetime: string;
  }
): Promise<string> {
  switch (queryType) {
    case "events": {
      if (context.events.length === 0) {
        return "No active or upcoming events found. Check back soon or create a new event!";
      }
      const eventList = context.events
        .map((e) => {
          const date = format(toZonedTime(e.eventDate, TZ), "dd MMM yyyy", { timeZone: TZ });
          const coordinator = e.coordinator?.displayName ?? "Unassigned";
          return `• ${e.title} (${e.status.replace(/_/g, " ")}) - ${date} - Coordinator: ${coordinator}`;
        })
        .join("\n");
      return `Here are the active and upcoming events:\n\n${eventList}`;
    }

    case "departments": {
      if (context.departments.length === 0) {
        return "No departments configured yet.";
      }
      const deptList = context.departments.map((d) => `• ${d.name}`).join("\n");
      return `Our departments:\n\n${deptList}`;
    }

    case "venues": {
      if (context.venues.length === 0) {
        return "No venues configured yet.";
      }
      const venueList = context.venues.map((v) => `• ${v.name}`).join("\n");
      return `Available venues:\n\n${venueList}`;
    }

    case "staff": {
      if (context.users.length === 0) {
        return "No staff members found.";
      }
      const staffList = context.users
        .map((u) => {
          const roles = u.roles.map((r) => r.role).join(", ") || "no role";
          return `• ${u.displayName} (${roles})`;
        })
        .join("\n");
      return `Team members:\n\n${staffList}`;
    }

    case "help": {
      return `I'm Speedy, your BIC Function Sheet assistant! 🏎 I can help you with:

• **Upcoming Events** - Ask "What events are coming up?" or "Show me events"
• **Departments** - Ask "What departments do we have?"
• **Venues** - Ask "What venues are available?"
• **Staff** - Ask "Who are the team members?" or "Show staff"

Just ask me anything about BIC's events and operations, and I'll provide accurate information from the system!`;
    }

    case "event_status": {
      const eventMatch = context.events.find((e) =>
        userQuery.toLowerCase().includes(e.title.toLowerCase())
      );
      if (eventMatch) {
        const date = format(toZonedTime(eventMatch.eventDate, TZ), "dd MMM yyyy", { timeZone: TZ });
        const coordinator = eventMatch.coordinator?.displayName ?? "Unassigned";
        const depts = eventMatch.departments.map((d) => d.department.name).join(", ") || "None";
        return `Event: ${eventMatch.title}\nStatus: ${eventMatch.status.replace(/_/g, " ")}\nDate: ${date}\nCoordinator: ${coordinator}\nDepartments: ${depts}`;
      }
      return "I couldn't find that specific event. Try asking about all events instead!";
    }

    default: {
      return `I'm Speedy, your BIC AI assistant! 🏎 I help with events, departments, venues, and staff information. What would you like to know?`;
    }
  }
}


export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let messages: ChatMessage[];
  try {
    const body = await req.json() as { messages: ChatMessage[] };
    messages = body.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("Bad Request", { status: 400 });
    }
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const lastMessage = messages[messages.length - 1];

  try {
    const [events, departments, venues, users] = await Promise.all([
      prisma.event.findMany({
        where: { status: { notIn: ["ARCHIVED"] } },
        select: {
          title: true,
          status: true,
          eventDate: true,
          coordinator: { select: { displayName: true } },
          departments: { select: { department: { select: { name: true } } } },
          eventVenues: { select: { venue: { select: { name: true } } } },
        },
        orderBy: { eventDate: "asc" },
        take: 20,
      }),
      prisma.department.findMany({
        where: { isActive: true },
        select: { name: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.venue.findMany({
        where: { isActive: true },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: {
          displayName: true,
          roles: { select: { role: true } },
        },
        orderBy: { displayName: "asc" },
      }),
    ]);

    const now = toZonedTime(new Date(), TZ);
    const datetime = format(now, "EEEE, dd MMM yyyy HH:mm", { timeZone: TZ });

    const queryType = parseUserQuery(lastMessage.content);
    const response = await generateResponse(queryType, lastMessage.content, {
      datetime,
      events,
      departments,
      venues,
      users,
    });

    return new Response(response, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Speedy API error:", error);
    return new Response("Sorry, I encountered an issue. Please try again.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 500,
    });
  }
}
