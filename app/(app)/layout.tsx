import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canCreateEvent } from "@/lib/authz";
import type { SessionUser } from "@/lib/authz";
import { Sidebar } from "@/components/app-shell/sidebar";
import { TopBar } from "@/components/app-shell/topbar";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { SpeedyChat } from "@/components/app-shell/speedy-chat";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (session.user.mustChangePassword) redirect("/change-password");

  const u = session.user as unknown as SessionUser;

  const user = {
    displayName: session.user.displayName,
    email: session.user.email,
    roles: session.user.roles,
  };

  // Fetch the 5 most-recently-updated events for the command palette
  const recentEvents = await prisma.event.findMany({
    select: { id: true, title: true, eventDate: true, status: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  return (
    <div className="flex min-h-dvh">
      <Sidebar roles={user.roles} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} />
        <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">
          <div className="mx-auto w-full max-w-7xl animate-fade-in-up">
            {children}
          </div>
        </main>
        <BottomNav roles={user.roles} />
      </div>
      <CommandPalette
        roles={session.user.roles}
        canCreate={canCreateEvent(u)}
        recentEvents={recentEvents.map((e) => ({
          id: e.id,
          title: e.title,
          eventDate: e.eventDate.toISOString(),
          status: e.status,
        }))}
      />
      <SpeedyChat />
    </div>
  );
}
