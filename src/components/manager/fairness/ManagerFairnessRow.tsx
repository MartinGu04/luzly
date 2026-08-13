import Link from "next/link";
import type { ManagerFairnessRowCardView } from "./types";

function Field({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-2">{label}</p>
      <p className={`text-sm ${emphasize ? "font-semibold text-foreground" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

/**
 * One fairness row, as a responsive card (this codebase never uses a
 * literal `<table>` -- see `ManagerCoverageSection`/`ManagerPotentialRow`)
 * rather than a desktop-only grid that would need a separate mobile
 * layout. Name/current score/delta/weekends/exemptions stay prominent;
 * allocation/target context is secondary (PR #15 §30). Exemptions are
 * always visible inline, never behind a tooltip (PR #15 §37).
 */
export function ManagerFairnessRow({ view }: { view: ManagerFairnessRowCardView }) {
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{view.sourceName}</p>
          <p className="text-xs text-muted">{view.allocationLabel || "—"}</p>
        </div>
        {view.exemptionBadges.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-1">
            {view.exemptionBadges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center rounded-full bg-overlay-soft px-2 py-0.5 text-[11px] font-medium text-muted"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
        <Field label="קודם" value={view.previousLabel} />
        <Field label="נוכחי" value={view.currentLabel} emphasize />
        <Field label="שינוי" value={view.deltaLabel} />
        <Field label="יעד השוואה" value={view.targetLabel ?? "—"} />
        <Field label="פער מהיעד" value={view.gapLabel ?? "—"} />
        <Field label='סופ"שים' value={view.weekendLabel} />
      </div>
    </>
  );

  const className =
    "block rounded-2xl bg-surface-1 p-4 ring-1 ring-border transition-colors duration-200" +
    (view.href ? " hover:bg-overlay-soft" : "");

  if (view.href) {
    return (
      <li>
        <Link href={view.href} className={className}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <div className={className}>{content}</div>
    </li>
  );
}
