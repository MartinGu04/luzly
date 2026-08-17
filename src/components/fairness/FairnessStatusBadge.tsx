import { ArrowDown, ArrowUp, HelpCircle, Minus } from "lucide-react";
import type { FairnessStatus } from "@/lib/domain/fairnessFoundation";
import { fairnessStatusLabel } from "@/lib/presentation/fairnessStatus";

interface FairnessStatusBadgeProps {
  status: FairnessStatus | null;
  className?: string;
}

/**
 * The shared below/balanced/above status pill (PR #4) -- deliberately ONE
 * restrained neutral tone for every real status, never green=good/
 * red=bad. "below"/"above" are descriptive facts, not failures, so they
 * get the exact same visual weight as "balanced" -- only the text and a
 * small directional (not evaluative) icon differ. Status is never
 * communicated by color alone: the Hebrew label is always present too. A
 * `null` status renders its own calm "לא ניתן לחשב יעד מלא" pill with a
 * help icon, never a fabricated fourth color-coded verdict and never
 * simply omitted (the actual confirmed workload elsewhere on the card
 * still needs this context to read honestly).
 */
export function FairnessStatusBadge({ status, className = "" }: FairnessStatusBadgeProps) {
  const Icon = status === "below" ? ArrowDown : status === "above" ? ArrowUp : status === "balanced" ? Minus : HelpCircle;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-border-strong ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" strokeWidth={2} />
      {fairnessStatusLabel(status)}
    </span>
  );
}
