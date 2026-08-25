"use client";

import { formatDurationParts, formatDurationUnitsLabel } from "@/lib/presentation/shootingRangeDuration";
import { useLiveClock } from "./useLiveClock";

export interface PlannedRangeCountdownProps {
  status: "planned" | "pending_confirmation";
  /** "03.09" -- already formatted server-side. */
  rangeDateLabel: string;
  /** ISO instant of the START of `rangeDate`'s Asia/Jerusalem civil day -- the countdown target for `status: "planned"`; the count-UP-since reference for `status: "pending_confirmation"` is this same instant plus one full day (i.e. the day has fully elapsed). */
  rangeDateStartInstantIso: string;
}

const DAY_MS = 86_400_000;

/**
 * A second, independent live countdown -- can be shown ALONGSIDE
 * `QualificationLiveCard` regardless of that card's own state (spec: "It
 * must be possible to see both at once"). Same hydration-safe pattern as
 * `QualificationLiveCard`: nothing here reads a client clock before mount.
 */
export function PlannedRangeCountdown({ status, rangeDateLabel, rangeDateStartInstantIso }: PlannedRangeCountdownProps) {
  const nowMs = useLiveClock();
  const startMs = new Date(rangeDateStartInstantIso).getTime();
  const isLive = nowMs !== null;

  if (status === "pending_confirmation") {
    const elapsedMs = isLive ? Math.max(0, nowMs - (startMs + DAY_MS)) : 0;
    const parts = formatDurationParts(elapsedMs);
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-semibold text-foreground">🎯 מטווח מ-{rangeDateLabel} ממתין לאישור מנהל</p>
        <span className="text-xs tabular-nums text-muted">
          {isLive ? `${parts.days} ימים · ${formatDurationUnitsLabel(parts)}` : "-- ימים · -- שעות · -- דקות · -- שניות"}
        </span>
      </div>
    );
  }

  const remainingMs = isLive ? Math.max(0, startMs - nowMs) : 0;
  const parts = formatDurationParts(remainingMs);
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-sm font-semibold text-foreground">🎯 מטווח מתוכנן</p>
      <span className="text-lg font-bold tabular-nums text-foreground">{isLive ? `${parts.days} ימים` : "-- ימים"}</span>
      <span className="text-sm tabular-nums text-muted">
        {isLive ? formatDurationUnitsLabel(parts) : "-- שעות · -- דקות · -- שניות"}
      </span>
      <span className="text-xs text-muted">עד למטווח המתוכנן בתאריך {rangeDateLabel}</span>
    </div>
  );
}
