import { Clock } from "lucide-react";
import { LiveClock } from "@/components/ui/LiveClock";

interface ShellUtilityBarProps {
  /** Same "HH:mm:ss" (or `null`) contract as `LiveClock.initialTime` -- see there for why it can be `null`. */
  initialClockTime: string | null;
}

/**
 * Restrained desktop-only top utility row for the app shell's main column
 * (Design Pass PR #19) -- the ONE place the live Jerusalem clock lives now,
 * so it reads as shell chrome rather than a dashboard-only decoration.
 * Deliberately quiet: a single small pill, right-aligned (the natural
 * reading-start edge under RTL), with room to grow -- a future utility
 * action would join it here rather than spawning a second row. Hidden
 * below `lg`, matching the desktop-only `Sidebar` -- mobile already has
 * `MobileIdentityBar`/`BottomNav` and gains nothing from a second chrome
 * row, so it stays out of both entirely (no clock, no overflow risk).
 */
export function ShellUtilityBar({ initialClockTime }: ShellUtilityBarProps) {
  return (
    <div className="hidden shrink-0 border-b border-border lg:block">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-end px-10 py-2">
        <div className="flex items-center gap-1.5 rounded-full bg-overlay-soft px-3 py-1 ring-1 ring-border">
          <Clock className="h-3.5 w-3.5 text-muted" aria-hidden="true" strokeWidth={1.75} />
          <LiveClock initialTime={initialClockTime} size="sm" />
        </div>
      </div>
    </div>
  );
}
