import type { QualificationStatus } from "@/lib/domain/shootingRangeQualification";

export interface QualificationStatusPresentation {
  label: string;
  badgeTone: "success" | "warning" | "critical" | "neutral";
  ringToneClassName: string;
}

/**
 * The one place this feature's qualification status is translated into a
 * label/color/emoji -- every UI surface (personal card, manager table,
 * requires-attention filter) reuses this, never re-deriving its own
 * mapping. `warning` is shared by both "מתקרב לחידוש" (<=30d) and
 * "פג בקרוב" (<=7d): both are still a VALID qualification, just at
 * different urgency, whereas `expired` is a genuinely different (critical)
 * state -- see the spec's own COUNTDOWN STATES section.
 */
export function presentQualificationStatus(status: QualificationStatus): QualificationStatusPresentation {
  switch (status) {
    case "valid":
      return { label: "✅ בתוקף", badgeTone: "success", ringToneClassName: "text-success" };
    case "expiring_soon":
      return { label: "🟡 מתקרב לחידוש", badgeTone: "warning", ringToneClassName: "text-warning" };
    case "expiring_very_soon":
      return { label: "🟠 פג בקרוב", badgeTone: "warning", ringToneClassName: "text-warning" };
    case "expired":
      return { label: "🔴 הכשירות פגה", badgeTone: "critical", ringToneClassName: "text-critical" };
    case "none":
      return { label: "אין מידע כשירות", badgeTone: "neutral", ringToneClassName: "text-muted-2" };
  }
}
