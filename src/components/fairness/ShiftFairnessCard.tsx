import Link from "next/link";
import type { ShiftFairnessCardView } from "@/lib/presentation/fairnessCards";
import { FairnessMetric } from "./FairnessMetric";
import { FairnessStatusBadge, fairnessStatusTintTextClass } from "./FairnessStatusBadge";
import { ShiftFairnessCardInfo } from "./ShiftFairnessCardInfo";

/**
 * One Shift Fairness person card (PR #4 §11, redesigned PR #51 follow-up)
 * -- name + status + ONE card-level info control, then a compact self-
 * explanatory metric grid (משמרות שבוצעו / יעד אישי / פער מהיעד, the gap
 * tinted with the same restrained status color as the badge), then a
 * smaller secondary weekend-context row, in that hierarchy. A `null`
 * target/status never renders as "0"/"מאוזן" -- `unavailableNote` replaces
 * the whole metric grid with a calm, honest sentence instead, while
 * `actualLabel` (always a real, confirmed number) stays visible
 * regardless. No generic "partial data" badge -- the note IS the only
 * incompleteness signal, shown only when it materially matters.
 *
 * `ShiftFairnessCardInfo` is the single explanatory affordance for every
 * metric on this card -- deliberately not one info icon per metric.
 *
 * STRUCTURE (PR #51 follow-up): the visible card content sits in a plain
 * `<div>`, with the navigable `<Link>` as an absolutely-positioned overlay
 * spanning the whole card -- NOT a wrapper around the content -- so
 * `ShiftFairnessCardInfo`'s real `<button>` is a SIBLING of the Link,
 * never a descendant. A `<button>` nested inside an `<a>` is invalid,
 * inaccessible interactive-in-interactive markup; this "stretched link"
 * shape keeps the whole card clickable/tappable exactly as before while
 * the info control's own higher z-index lets it (and its popover) receive
 * clicks instead of the Link underneath, at the same spot it's always
 * visually been.
 */
export function ShiftFairnessCard({ view }: { view: ShiftFairnessCardView }) {
  return (
    <li className="relative">
      <div className="rounded-2xl bg-surface-1 p-4 ring-1 ring-border">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">{view.personName}</p>
            <ShiftFairnessCardInfo />
          </div>
          <FairnessStatusBadge status={view.status} />
        </div>

        {view.unavailableNote ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            <span className="font-medium text-foreground">משמרות שבוצעו: {view.actualLabel}</span> · {view.unavailableNote}
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-1 rounded-xl bg-overlay-faint px-3 py-2.5">
            <FairnessMetric testId="metric-shift-actual" label="משמרות שבוצעו" value={view.actualLabel} />
            <FairnessMetric testId="metric-shift-target" label="יעד אישי" value={view.targetLabel ?? "—"} />
            <FairnessMetric
              testId="metric-shift-gap"
              label="פער מהיעד"
              value={view.deviationLabel ?? "—"}
              toneClassName={fairnessStatusTintTextClass(view.status)}
            />
          </div>
        )}

        <div className="mt-2 flex items-center gap-4 border-t border-border pt-2 text-xs text-muted-2">
          <span data-testid="metric-shift-weekend-actual">
            משמרות סופ&quot;ש שבוצעו <span className="font-medium text-muted">{view.weekendActualLabel}</span>
          </span>
          {view.weekendTargetLabel ? (
            <span data-testid="metric-shift-weekend-target">
              יעד סופ&quot;ש <span className="font-medium text-muted">{view.weekendTargetLabel}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Stretched-link overlay: covers the whole card (z-10), so clicking/
          tapping anywhere except the elevated info control (z-20) navigates
          to the person detail. Transparent, with its own hover/focus tint
          since it -- not the content div above -- is the top layer. */}
      <Link
        href={view.href}
        aria-label={view.personName}
        className="absolute inset-0 z-10 rounded-2xl transition-colors duration-200 hover:bg-overlay-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
    </li>
  );
}
