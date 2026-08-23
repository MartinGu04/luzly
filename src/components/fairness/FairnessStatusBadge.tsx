import { ArrowDown, ArrowUp, HelpCircle, Minus } from "lucide-react";
import type { FairnessStatus } from "@/lib/domain/fairnessFoundation";
import { fairnessStatusLabel } from "@/lib/presentation/fairnessStatus";

interface FairnessStatusBadgeProps {
  status: FairnessStatus | null;
  className?: string;
  /** Overrides the badge's own default `fairnessStatusLabel` text -- e.g. Shift Fairness passes `fairnessShiftStatusLabel` (`lib/presentation/fairnessStatus.ts`) so the badge says "above/below EXPECTED" rather than "above/below TARGET", since Shift's comparison value is an adjusted expectation up to today, not a fixed target. Icon/tint stay driven by `status` either way. */
  label?: string;
}

/**
 * Restrained, DESCRIPTIVE (never punitive) per-status tint (PR #51 follow-
 * up) -- balanced/below/above each get their OWN calm, low-saturation
 * tone (the `--status-*` tokens in `globals.css`, reused from the
 * existing --success/--primary/--warning palette rather than a new raw
 * palette), all deliberately the SAME restrained strength so none reads as
 * "more wrong" than another -- this is a legibility aid, not a traffic
 * light. `null` ("unavailable") stays fully neutral gray, matching the
 * page's existing overlay/muted tokens. Exported so the same tint can be
 * applied to a related value elsewhere on a card (e.g. the "פער מהיעד"
 * figure) without duplicating this mapping.
 */
const STATUS_TINT_CLASSES: Record<"below" | "balanced" | "above", string> = {
  below: "bg-status-below-soft text-status-below ring-status-below-border",
  balanced: "bg-status-balanced-soft text-status-balanced ring-status-balanced-border",
  above: "bg-status-above-soft text-status-above ring-status-above-border",
};

const NEUTRAL_TINT_CLASSES = "bg-overlay-soft text-muted ring-border-strong";

/** Text-only color class for the given status -- for tinting a related value (e.g. a gap figure) without the badge's own background/ring. `null` stays the neutral `text-muted`. */
export function fairnessStatusTintTextClass(status: FairnessStatus | null): string {
  if (status === "below") return "text-status-below";
  if (status === "balanced") return "text-status-balanced";
  if (status === "above") return "text-status-above";
  return "text-muted";
}

/**
 * The shared below/balanced/above status pill (PR #4, tinting added PR #51
 * follow-up) -- "below"/"above" are descriptive facts, not failures, so
 * they get the exact same TINT STRENGTH as "balanced" -- only the hue,
 * text, and a small directional (not evaluative) icon differ. Status is
 * never communicated by color alone: the Hebrew label is always present
 * too, and every tone stays subdued enough to read as informational, never
 * as a traffic-light pass/fail. A `null` status renders its own calm,
 * NEUTRAL GRAY, GENERIC "לא ניתן להשוות" pill with a help icon, never a
 * fabricated fourth color-coded verdict and never simply omitted (the
 * actual confirmed workload elsewhere on the card still needs this context
 * to read honestly). Deliberately generic, not "target unavailable" -- a
 * null status can come from a missing target OR a missing actual/current
 * value, and this badge alone can't tell which (see `fairnessStatusLabel`'s
 * own docs); a caller that knows the specific reason renders that
 * separately.
 */
export function FairnessStatusBadge({ status, className = "", label }: FairnessStatusBadgeProps) {
  const Icon = status === "below" ? ArrowDown : status === "above" ? ArrowUp : status === "balanced" ? Minus : HelpCircle;
  const tintClasses = status !== null ? STATUS_TINT_CLASSES[status] : NEUTRAL_TINT_CLASSES;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tintClasses} ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" strokeWidth={2} />
      {label ?? fairnessStatusLabel(status)}
    </span>
  );
}
