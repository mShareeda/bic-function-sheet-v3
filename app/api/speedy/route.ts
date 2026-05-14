import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { toZonedTime, format } from "date-fns-tz";

export const dynamic = "force-dynamic";

const TZ = process.env.APP_TIMEZONE ?? "Asia/Bahrain";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildSystemPrompt(ctx: {
  datetime: string;
  events: Array<{
    title: string;
    status: string;
    eventDate: Date;
    liveStart: Date | null;
    liveEnd: Date | null;
    coordinator: { displayName: string } | null;
    departments: Array<{ department: { name: string } }>;
    eventVenues: Array<{ venue: { name: string } }>;
  }>;
  departments: Array<{ name: string }>;
  venues: Array<{ name: string }>;
  users: Array<{ displayName: string; roles: Array<{ role: string }> }>;
}): string {
  const eventLines = ctx.events
    .map((e) => {
      const date = format(toZonedTime(e.eventDate, TZ), "dd MMM yyyy", { timeZone: TZ });
      const depts = e.departments.map((d) => d.department.name).join(", ") || "none";
      const venues = e.eventVenues.map((v) => v.venue.name).join(", ") || "none";
      const coord = e.coordinator?.displayName ?? "unassigned";
      return `  - ${e.title} | ${e.status.replace(/_/g, " ")} | ${date} | Coordinator: ${coord} | Venues: ${venues} | Departments: ${depts}`;
    })
    .join("\n");

  const deptLines = ctx.departments.map((d) => `  - ${d.name}`).join("\n");
  const venueLines = ctx.venues.map((v) => `  - ${v.name}`).join("\n");
  const staffLines = ctx.users
    .map((u) => {
      const roles = u.roles.map((r) => r.role).join(", ");
      return `  - ${u.displayName} (${roles || "no role"})`;
    })
    .join("\n");

  return `You are Speedy, the friendly AI assistant and official mascot of Bahrain International Circuit (BIC).
You help BIC staff use the Function Sheet system (Version Beta 0.03) to coordinate internal events.

Your personality: energetic, knowledgeable, professional, and concise. You know everything about BIC operations and this app.

About the BIC Function Sheet system:
- Manages internal events (concerts, corporate, motorsport, hospitality, etc.)
- Event lifecycle: DRAFT → CONFIRMED → PROVISIONAL_FUNCTION_SHEET_SENT → FUNCTION_SHEET_SENT → IN_SETUP → LIVE → CLOSED → ARCHIVED
- Coordinators create and manage events; Department Managers fill in requirements; Team Members execute assigned tasks
- Venues, departments, and staff are all managed within this system
- PDF function sheets can be generated and sent to departments
- There are four user roles: ADMIN, COORDINATOR, DEPT_MANAGER, DEPT_TEAM_MEMBER

Current date/time (Bahrain): ${ctx.datetime}

## Active & Upcoming Events (${ctx.events.length})
${eventLines || "  (no active events)"}

## Departments (${ctx.departments.length})
${deptLines || "  (none)"}

## Venues (${ctx.venues.length})
${venueLines || "  (none)"}

## Staff (${ctx.users.length})
${staffLines || "  (none)"}

Answer questions helpfully and concisely. Use the real names of events, staff, departments, and venues from the data above. If you don't know something specific, say so honestly. Keep responses friendly but brief unless detail is needed.`;
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

  const [events, departments, venues, users] = await Promise.all([
    prisma.event.findMany({
      where: { status: { notIn: ["ARCHIVED"] } },
      select: {
        title: true,
        status: true,
        eventDate: true,
        liveStart: true,
        liveEnd: true,
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

  const systemPrompt = buildSystemPrompt({ datetime, events, departments, venues, users });

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    const mockResponse =
      "Hi there! I'm Speedy, your BIC AI assistant — I'm still warming up my engines! 🏎 The team is connecting me to the AI system shortly. In the meantime, feel free to explore the app. Check the Events page for upcoming events, the Calendar for a timeline view, or reach out to your coordinator for help!";
    return new Response(mockResponse, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      systemInstruction: systemPrompt,
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage.content);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (error) {
          console.error("Stream chunk error:", error);
          controller.error(new Error("Stream error"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Speedy API error:", error);
    const errorResponse =
      "Sorry, I'm having trouble connecting to the track right now. Please try again in a moment!";
    return new Response(errorResponse, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
