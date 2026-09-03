"use client";

import {
  formatDischargeClock,
  resolveDischargeCountdownState,
  resolveDischargeMilestoneCopy,
  type DischargeCountdownState,
} from "@/lib/presentation/dischargeCountdown";
import { useLiveClock } from "./useLiveClock";

export interface DischargeCountdownScreenProps {
  /** "24.01.2027" -- already formatted server-side. */
  dischargeDateLabel: string;
  /** ISO instants resolved server-side (`lib/time/jerusalemClock`, server-only) -- this client component only ever does plain ms arithmetic against them, never its own timezone conversion. */
  dischargeInstantIso: string;
  dischargeDayEndInstantIso: string;
  enlistmentInstantIso: string | null;
}

/**
 * "עד מתי???" -- a full-bleed, always-dark cinematic countdown (spec: "not a
 * normal dashboard card"), ticking every second. Hydration-safe the same
 * way every other live countdown in this app is (`PlannedRangeCountdown`/
 * `QualificationLiveCard`): `useLiveClock()` is `null` on the very first
 * render (identical during SSR and hydration), so a fixed placeholder
 * renders then -- never a `Date.now()` read before mount.
 *
 * All of the actual state (which phase, days/H:M:S, milestone, service
 * progress) comes from the single pure `resolveDischargeCountdownState` --
 * this component only ticks the clock and renders whatever that function
 * says, so there is exactly one place the countdown's math can be wrong.
 */
export function DischargeCountdownScreen({
  dischargeDateLabel,
  dischargeInstantIso,
  dischargeDayEndInstantIso,
  enlistmentInstantIso,
}: DischargeCountdownScreenProps) {
  const nowMs = useLiveClock();

  const state =
    nowMs === null
      ? null
      : resolveDischargeCountdownState(
          nowMs,
          new Date(dischargeInstantIso).getTime(),
          new Date(dischargeDayEndInstantIso).getTime(),
          enlistmentInstantIso ? new Date(enlistmentInstantIso).getTime() : null,
        );

  const serviceProgress =
    state?.phase === "counting_down" || state?.phase === "discharge_day" ? state.serviceProgress : null;
  const daysRemainingForStats = state?.phase === "counting_down" ? state.daysRemaining : 0;
  const showStatsRow = state?.phase === "counting_down" || state?.phase === "discharge_day";

  return (
    <div className="relative flex min-h-[calc(100dvh-10rem)] flex-col items-center justify-center overflow-hidden rounded-3xl bg-[#05070a] px-4 py-16 text-center text-white sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(79,195,232,0.16),_transparent_60%)]"
      />

      <div className="relative flex flex-col items-center gap-2">
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">עד מתי???</h1>
        <p className="text-sm text-white/60 sm:text-base">עד השחרור נשארו</p>
      </div>

      <div className="relative mt-10 flex min-h-[10rem] flex-col items-center justify-center gap-3 sm:mt-14 sm:min-h-[14rem]">
        {renderMainState(state)}
      </div>

      <div className="relative mt-10 flex flex-col items-center gap-1.5 text-sm text-white/70 sm:mt-14 sm:text-base">
        <p>תאריך שחרור: {dischargeDateLabel}</p>
        {showStatsRow ? (
          <>
            {serviceProgress ? (
              <>
                <p className="font-semibold text-white">{serviceProgress.percentServed}% מאחוריך</p>
                <p className="tabular-nums">{serviceProgress.daysServed} ימים בשירות</p>
              </>
            ) : null}
            <p className="tabular-nums">{daysRemainingForStats} ימים נשארו</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function renderMainState(state: DischargeCountdownState | null) {
  if (!state) {
    return (
      <>
        <span className="text-7xl font-black tabular-nums leading-none sm:text-9xl">--</span>
        <span className="text-2xl font-semibold text-white/80 sm:text-4xl">ימים</span>
        <span className="mt-2 font-mono text-3xl font-bold tabular-nums tracking-widest text-white/50 sm:text-5xl">
          -- : -- : --
        </span>
      </>
    );
  }

  if (state.phase === "discharge_day") {
    return (
      <p className="text-4xl font-black leading-tight sm:text-7xl" style={{ color: "#3ecf8e" }}>
        זהו. השתחררת.
      </p>
    );
  }

  if (state.phase === "post_discharge") {
    return (
      <p className="text-3xl font-black leading-tight sm:text-6xl">
        משוחרר כבר {state.daysSinceDischarge} ימים
      </p>
    );
  }

  const copy = resolveDischargeMilestoneCopy(state.milestone);

  return (
    <>
      {copy.badge ? (
        <span className="animate-pulse-dot text-lg font-bold sm:text-2xl" style={{ color: copy.accentColor }}>
          {copy.badge}
        </span>
      ) : null}
      <span className="text-7xl font-black tabular-nums leading-none sm:text-9xl" style={{ color: copy.accentColor }}>
        {state.daysRemaining}
      </span>
      <span className="text-2xl font-semibold text-white/80 sm:text-4xl">ימים</span>
      <span className="mt-2 font-mono text-3xl font-bold tabular-nums tracking-widest text-white/90 sm:text-5xl">
        {formatDischargeClock(state.clock)}
      </span>
    </>
  );
}
