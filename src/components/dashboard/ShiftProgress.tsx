"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssignmentTiming } from "@/lib/domain/assignmentTiming";
import { formatRemaining, formatStartsIn } from "@/lib/presentation/duration";

type ResolvedTiming = Extract<AssignmentTiming, { status: "resolved" }>;

interface ShiftProgressProps {
  timing: ResolvedTiming;
  /** The read model's `fetchedAt` (ISO instant) -- the wall-clock anchor this ticks forward from. */
  fetchedAt: string;
  mode: "current" | "upcoming";
}

/**
 * Advances the server-computed timing forward using elapsed real wall-clock
 * time since `fetchedAt` -- never re-deriving scheduling semantics, only
 * adding `Date.now() - fetchedAt` on top of numbers the server already
 * resolved correctly. When a shift boundary is crossed (finishes, or an
 * upcoming one starts), triggers exactly one `router.refresh()` so the
 * authoritative Server Component can move current -> past or
 * upcoming -> current.
 *
 * `Date.now()` is only ever read inside an effect (never during render) --
 * render itself stays a pure function of `elapsedSinceLoadMinutes` state.
 */
export function ShiftProgress({ timing, fetchedAt, mode }: ShiftProgressProps) {
  const router = useRouter();
  const hasRefreshedRef = useRef(false);
  const [elapsedSinceLoadMinutes, setElapsedSinceLoadMinutes] = useState(0);

  useEffect(() => {
    const loadedAtMs = Date.parse(fetchedAt);
    const update = () => setElapsedSinceLoadMinutes(Math.max(0, (Date.now() - loadedAtMs) / 60_000));
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [fetchedAt]);

  const liveElapsed =
    mode === "current"
      ? Math.min(timing.durationMinutes, timing.elapsedMinutesAtLoad + elapsedSinceLoadMinutes)
      : timing.elapsedMinutesAtLoad;
  const liveMinutesUntilStart =
    mode === "upcoming" ? Math.max(0, timing.minutesUntilStartAtLoad - elapsedSinceLoadMinutes) : 0;

  const boundaryCrossed =
    mode === "current"
      ? liveElapsed >= timing.durationMinutes
      : timing.minutesUntilStartAtLoad > 0 && liveMinutesUntilStart <= 0;

  useEffect(() => {
    if (boundaryCrossed && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      router.refresh();
    }
  }, [boundaryCrossed, router]);

  if (mode === "upcoming") {
    if (timing.minutesUntilStartAtLoad <= 0) return null;
    return <p className="text-sm font-medium text-primary">{formatStartsIn(liveMinutesUntilStart)}</p>;
  }

  const remaining = Math.max(0, timing.durationMinutes - liveElapsed);
  const progressPercent =
    timing.durationMinutes === 0 ? 0 : Math.min(100, Math.round((liveElapsed / timing.durationMinutes) * 100));

  return (
    <div>
      <p className="flex items-baseline gap-2 text-sm font-medium text-foreground">
        {formatRemaining(remaining)}
        <span aria-hidden="true" className="text-xs font-normal text-muted-2">
          {progressPercent}%
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="התקדמות המשמרת"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-overlay-soft"
      >
        <div
          className="h-full rounded-full bg-primary shadow-[0_0_12px_1px_var(--primary)] transition-[width] duration-1000 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
