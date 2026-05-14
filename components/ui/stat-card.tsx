"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

type Tone = "primary" | "live" | "warning" | "info";

const toneMap: Record<Tone, { gradient: string; shadow: string }> = {
  primary: {
    gradient: "from-primary/15 to-primary/0",
    shadow:
      "hover:shadow-[0_0_40px_hsl(var(--primary)/0.18),var(--shadow-glass-lg)]",
  },
  live: {
    gradient: "from-status-live/20 to-status-live/0",
    shadow:
      "hover:shadow-[0_0_40px_hsl(var(--status-live)/0.2),var(--shadow-glass-lg)]",
  },
  warning: {
    gradient: "from-accent/25 to-accent/0",
    shadow:
      "hover:shadow-[0_0_40px_hsl(var(--accent)/0.2),var(--shadow-glass-lg)]",
  },
  info: {
    gradient: "from-status-confirmed/15 to-status-confirmed/0",
    shadow:
      "hover:shadow-[0_0_40px_hsl(var(--status-confirmed)/0.18),var(--shadow-glass-lg)]",
  },
};

export function StatCard({
  label,
  value,
  sub,
  tone = "primary",
  delay = 0,
  href,
}: {
  label: string;
  value: number;
  sub: string;
  tone?: Tone;
  delay?: number;
  href?: string;
}) {
  const count = useCountUp(value);
  const { gradient, shadow } = toneMap[tone];

  const cardContent = (
    <Card
      className={cn(
        "glass-strong relative overflow-hidden p-5",
        "animate-fade-in-up will-change-transform",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1.5",
        href && "cursor-pointer",
        shadow,
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {/* coloured orb */}
      <div
        aria-hidden
        className={cn(
          "absolute -right-6 -top-6 h-32 w-32 rounded-full bg-gradient-to-br blur-2xl opacity-70",
          gradient,
        )}
      />
      <div className="relative space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-3xl font-bold tabular-nums tracking-tight">
          {count}
        </p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="focus-ring rounded-lg">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
