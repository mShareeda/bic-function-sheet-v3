"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RoleName } from "@prisma/client";
import { Menu, Flag, LogOut, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { signOutAction } from "@/server/actions/auth";
import { NotificationBell } from "./notification-bell";
import { SpeedyChatTrigger } from "./speedy-chat";

type Props = {
  user: { displayName: string; email: string; roles: RoleName[] };
};

export function TopBar({ user }: Props) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  const crumbs = buildCrumbs(pathname);
  const initials = user.displayName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const visibleNav = NAV_ITEMS.filter((i) => i.show(user.roles));
  const primary = visibleNav.filter((i) => i.group === "primary");
  const admin = visibleNav.filter((i) => i.group === "admin");

  return (
    <header className="glass-strong sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/40 px-4 lg:px-6">
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col gap-1 px-4 py-5">
            <Link
              href="/dashboard"
              onClick={() => setDrawerOpen(false)}
              className="mb-3 flex items-center gap-2.5 rounded-md px-2 py-2"
            >
              <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
                <Flag className="h-5 w-5" />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-bold text-sm">BIC</span>
                <span className="text-[11px] text-muted-foreground">
                  Function Sheet
                </span>
              </span>
            </Link>
            <DrawerNav
              items={primary}
              pathname={pathname}
              onClick={() => setDrawerOpen(false)}
            />
            {admin.length > 0 && (
              <>
                <div className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Admin
                </div>
                <DrawerNav
                  items={admin}
                  pathname={pathname}
                  onClick={() => setDrawerOpen(false)}
                />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Link
        href="/dashboard"
        className="lg:hidden flex items-center gap-2 font-semibold"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <Flag className="h-3.5 w-3.5" />
        </span>
      </Link>

      <nav
        aria-label="Breadcrumb"
        className="hidden md:flex min-w-0 flex-1 items-center gap-1 text-sm"
      >
        {crumbs.map((c, i) => (
          <React.Fragment key={c.href}>
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
            {i === crumbs.length - 1 ? (
              <span className="truncate font-medium">{c.label}</span>
            ) : (
              <Link
                href={c.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {c.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <CommandTrigger />
        <SpeedyChatTrigger compact />
        <ThemeToggle />
        <NotificationBell />

        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            className="focus-ring flex items-center gap-2 rounded-full p-0.5 pr-3 hover:bg-surface/60 transition-colors"
            aria-label="User menu"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
              {initials || "?"}
            </span>
            <span className="hidden lg:inline text-sm font-medium">
              {user.displayName}
            </span>
          </button>
          {userMenuOpen && (
            <div className="glass-strong absolute right-0 top-full z-50 mt-2 w-56 rounded-md p-2 animate-fade-in-up">
              <div className="px-2 py-2 border-b border-border/40 mb-1">
                <div className="text-sm font-medium truncate">
                  {user.displayName}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {user.email}
                </div>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-surface/70 transition-colors text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DrawerNav({
  items,
  pathname,
  onClick,
}: {
  items: typeof NAV_ITEMS;
  pathname: string;
  onClick: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function buildCrumbs(pathname: string): { href: string; label: string }[] {
  if (!pathname || pathname === "/") return [{ href: "/", label: "Home" }];
  const parts = pathname.split("/").filter(Boolean);
  const out: { href: string; label: string }[] = [];
  let acc = "";
  for (const part of parts) {
    acc += "/" + part;
    out.push({
      href: acc,
      label: humanize(part),
    });
  }
  return out;
}

function humanize(seg: string) {
  if (/^[0-9a-f]{8,}$/i.test(seg) || /^c[a-z0-9]{20,}$/i.test(seg)) {
    return "Detail";
  }
  return seg
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function CommandTrigger() {
  function onClick() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open command palette (Cmd+K)"
      className="focus-ring hidden sm:inline-flex items-center gap-2 h-8 px-3 rounded-md border border-border/50 bg-surface/40 text-xs text-muted-foreground hover:bg-surface/70 transition-colors"
    >
      <Search className="h-3 w-3" />
      <span>Search</span>
      <kbd className="ml-1 hidden md:inline text-[10px] font-medium opacity-60">⌘K</kbd>
    </button>
  );
}
