import { Badge } from "@/components/ui/Badge";
import type { DutyBlockView } from "./types";

interface DutyBlockRowProps {
  view: DutyBlockView;
}

/**
 * One duty block, compact and highly readable -- the single row design
 * reused everywhere a block appears (focus section, upcoming list,
 * history list). Its own state (active/certainty/pending) decides what to
 * show; no separate "focus variant" vs "list variant" component. One flat
 * surface with lightweight rows, never a card inside a card.
 */
export function DutyBlockRow({ view }: DutyBlockRowProps) {
  const metaLine = [view.dateRangeLabel, view.dayCountLabel].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl bg-overlay-faint p-3 ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {view.emoji ? <span aria-hidden="true">{view.emoji}</span> : null}
          {view.title}
        </p>
        {view.isActive || view.certaintyLabel || view.weekendPartialWarning ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {view.isActive ? <Badge tone="primary">פעיל</Badge> : null}
            {view.certaintyLabel ? <Badge tone="warning">{view.certaintyLabel}</Badge> : null}
            {view.weekendPartialWarning ? <Badge tone="warning">{'סופ"ש חלקי'}</Badge> : null}
          </div>
        ) : null}
      </div>

      {metaLine ? <p className="mt-1 text-xs text-muted">{metaLine}</p> : null}

      {view.progress && view.progress.totalDays > 1 ? (
        <p className="mt-1 text-xs text-muted">
          יום {view.progress.dayIndex} מתוך {view.progress.totalDays}
        </p>
      ) : null}

      {view.pending ? (
        <p className="mt-1.5 text-xs text-muted">
          <span className="font-medium text-foreground">{view.pending.label}</span>
          {view.pending.label === "בדיקה" ? " " : ": "}
          {view.pending.items.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
