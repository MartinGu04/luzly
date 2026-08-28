"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { computeLiveEventProgress } from "@/lib/presentation/liveEventProgress";
import { formatCountdownToStart, formatRemaining } from "@/lib/presentation/duration";

interface EventLiveProgressProps {
  /** Real Asia/Jerusalem-resolved instant (ISO) of the event's start -- see `Hero`'s `resolveEventInstants`, built on `lib/time/jerusalemClock`. */
  startInstant: string;
  /** Real instant (ISO) of the event's end, or `null` when unknown. */
  endInstant: string | null;
  /** Which half of the lifecycle this render is anchored to -- decided server-side (the same current/upcoming split `Hero` already makes), never re-derived here. */
  mode: "countdown" | "active";
  /** The read model's `fetchedAt` (ISO) -- the wall-clock anchor this ticks forward from, same convention as `ShiftProgress`. */
  fetchedAt: string;
}

const TICK_MS = 60_000;

/**
 * The Home hero card's one live, non-interactive progress element -- a
 * thin timeline bar, never a slider (no draggable thumb, no slider
 * semantics). Two meanings share this one visual slot: a countdown to
 * start in the final 24h before an event, then (once the server flips
 * CurrentHero/NextHero at the boundary) progress through the event itself
 * -- one continuous lifecycle, both driven by the same pure
 * `computeLiveEventProgress`.
 *
 * Ticks once a minute from `fetchedAt` -- never `Date.now()` during render
 * (see `ShiftProgress`'s identical convention, which this mirrors for the
 * same SSR/hydration-safety reason: the very first client render must
 * compute the exact same thing the server did).
 */
export function EventLiveProgress({ startInstant, endInstant, mode, fetchedAt }: EventLiveProgressProps) {
  const router = useRouter();
  const hasRefreshedRef = useRef(false);
  const [elapsedSinceFetchMs, setElapsedSinceFetchMs] = useState(0);

  useEffect(() => {
    const fetchedAtMs = Date.parse(fetchedAt);
    const update = () => setElapsedSinceFetchMs(Math.max(0, Date.now() - fetchedAtMs));
    update();
    const interval = setInterval(update, TICK_MS);
    return () => clearInterval(interval);
  }, [fetchedAt]);

  const now = Date.parse(fetchedAt) + elapsedSinceFetchMs;
  const start = Date.parse(startInstant);
  const end = endInstant === null ? null : Date.parse(endInstant);
  const state = computeLiveEventProgress({ now, start, end });

  // The math has moved past the phase this render is anchored to (start or
  // end crossed) -- refresh exactly once so the server can re-derive
  // current/upcoming and swap CurrentHero/NextHero, rather than this
  // component trying to re-narrate the card's own framing client-side.
  const boundaryCrossed = state.mode !== mode;

  useEffect(() => {
    if (boundaryCrossed && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      router.refresh();
    }
  }, [boundaryCrossed, router]);

  if (mode === "countdown" && state.mode === "hidden") return null;

  const progressPercent = boundaryCrossed ? 100 : state.progressPercent;
  const remainingMinutes = boundaryCrossed ? 0 : state.remainingMinutes;
  const label = mode === "countdown" ? formatCountdownToStart(remainingMinutes) : formatRemaining(remainingMinutes);
  const ariaLabel = mode === "countdown" ? "זמן עד תחילת המשמרת" : "התקדמות המשמרת";

  return (
    <div>
      <p className="text-sm font-medium text-primary">{label}</p>
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={Math.round(progressPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-overlay-soft"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
