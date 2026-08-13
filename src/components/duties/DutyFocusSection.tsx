import type { DutyFocusStatus } from "@/lib/presentation/duty";
import { Panel } from "@/components/ui/Panel";
import { DutyBlockRow } from "./DutyBlockRow";
import type { DutyBlockView } from "./types";

interface DutyFocusSectionProps {
  status: DutyFocusStatus;
  blocks: DutyBlockView[];
  /** The Hebrew-calendar date for the focused date (today if active, the next block's start date otherwise) -- shown once, subtly, never per-row. */
  hebrewDateLabel: string | null;
  holiday: { emoji: string; label: string } | null;
}

/**
 * The screen's headline: every currently-active duty, or (failing that)
 * every block sharing the single earliest future start date, or a calm
 * empty state. Never assumes there is exactly one -- `blocks` can hold
 * several simultaneous/co-starting duties, all shown.
 */
export function DutyFocusSection({ status, blocks, hebrewDateLabel, holiday }: DutyFocusSectionProps) {
  if (status === "none") {
    return (
      <Panel variant="hero" className="text-center sm:text-start">
        <span aria-hidden="true" className="text-3xl">
          🎉
        </span>
        <p className="mt-3 text-base font-semibold text-foreground">אין לך תורנויות קרובות</p>
      </Panel>
    );
  }

  const heading = status === "active" ? "בתורנות עכשיו" : "התורנות הבאה";

  return (
    <Panel variant="hero">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-muted">{heading}</h2>
        {hebrewDateLabel || holiday ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {hebrewDateLabel ? <span className="text-xs text-muted">{hebrewDateLabel}</span> : null}
            {holiday ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-overlay-soft px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-border">
                <span aria-hidden="true">{holiday.emoji}</span>
                {holiday.label}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-2.5">
        {blocks.map((block) => (
          <DutyBlockRow key={block.key} view={block} />
        ))}
      </div>
    </Panel>
  );
}
