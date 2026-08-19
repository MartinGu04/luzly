import type { FairnessDataCompletenessReason, FairnessStatus } from "@/lib/domain/fairnessFoundation";
import type { PersonnelServiceCategory } from "@/lib/domain/personnelType";
import { exemptionBadgeLabel, formatFairnessDelta, formatFairnessGap, formatFairnessScore, formatFairnessWeekendCount } from "@/lib/presentation/fairness";
import type { DutyFairnessPersonRowView } from "@/lib/readModels/dutyFairnessTypes";
import type { ShiftFairnessPersonRowView } from "@/lib/readModels/shiftFairnessTypes";

/**
 * Presentation-ready view of one `ShiftFairnessPersonRowView`, pre-
 * formatted for both the card and the detail overlay (same convention as
 * `ManagerFairnessRowCardView`) -- `target`/`deviation`/`weekendTarget`/
 * `weekendDeviation` reuse the EXISTING `number | null` formatters from
 * `lib/presentation/fairness.ts` (they already handle "unavailable, never
 * a fabricated 0" honestly; nothing shift-specific needed re-deriving).
 * `unavailableNote` is set ONLY when `target` is `null` -- the one case
 * where the card must actively explain itself rather than silently show
 * "—", since a null target/status pair could otherwise read as a data bug.
 */
export interface ShiftFairnessCardView {
  key: string;
  personId: string;
  personName: string;
  /** Presentation-only Google avatar photo, `null` when none is known -- the card falls back to initials either way (see `components/ui/Avatar`). */
  avatarUrl: string | null;
  /** Carried straight from the row (PR #51 follow-up) so the service-type presentation subgrouping can be built from cards alone, with no separate roster lookup. */
  serviceCategory: PersonnelServiceCategory;
  href: string;
  actualLabel: string;
  targetLabel: string | null;
  deviationLabel: string | null;
  status: FairnessStatus | null;
  weekendActualLabel: string;
  weekendTargetLabel: string | null;
  weekendDeviationLabel: string | null;
  weekendStatus: FairnessStatus | null;
  unavailableNote: string | null;
  /** Set only for a genuinely meaningful data-completeness gap -- see `shiftFairnessCompletenessNote`. Never a raw machine reason key. */
  completenessNote: string | null;
}

const SHIFT_COMPLETENESS_MESSAGES: Partial<Record<FairnessDataCompletenessReason, string>> = {
  shift_target_unmodelable_evidence_only:
    "העבודה בפועל שלו/שלה ממשיכה להיראות, אך אין כרגע מספיק נתונים כדי לחשב עבור אדם זה יעד אישי בתקופה הנוכחית.",
  shift_target_unmodelable_historical:
    "זו תקופה שכבר הסתיימה, ואין נתון מתועד לתקופה הזו שמאפשר לשחזר את היעד בהגינות.",
  shift_target_no_group_opportunities:
    "בוצעה עבודה בפועל, אך לא נמצאה בנתונים הזדמנות תואמת שמסבירה מי היה אמור לבצע אותה -- לכן היעד אינו זמין כרגע.",
};

/** Maps a Shift Fairness `dataCompleteness.reasons` list to ONE concise, honest Hebrew explanation -- never a raw machine key, and `null` for a reason list with nothing materially relevant to explain (e.g. participation/eligibility gaps that don't change what's shown here). */
export function shiftFairnessCompletenessNote(reasons: readonly FairnessDataCompletenessReason[]): string | null {
  for (const reason of reasons) {
    const message = SHIFT_COMPLETENESS_MESSAGES[reason];
    if (message) return message;
  }
  return null;
}

export function buildShiftFairnessCardView(row: ShiftFairnessPersonRowView, href: string): ShiftFairnessCardView {
  return {
    key: row.personId,
    personId: row.personId,
    personName: row.personName,
    avatarUrl: row.avatarUrl ?? null,
    serviceCategory: row.serviceCategory,
    href,
    actualLabel: String(row.actualShifts),
    targetLabel: row.target !== null ? formatFairnessScore(row.target) : null,
    deviationLabel: row.deviation !== null ? formatFairnessGap(row.deviation) : null,
    status: row.status,
    weekendActualLabel: String(row.weekendActualShifts),
    weekendTargetLabel: row.weekendTarget !== null ? formatFairnessScore(row.weekendTarget) : null,
    weekendDeviationLabel: row.weekendDeviation !== null ? formatFairnessGap(row.weekendDeviation) : null,
    weekendStatus: row.weekendStatus,
    unavailableNote: row.target === null ? "לא ניתן לחשב יעד מלא לתקופה זו" : null,
    completenessNote: shiftFairnessCompletenessNote(row.dataCompleteness.reasons),
  };
}

/**
 * Presentation-ready view of one `DutyFairnessPersonRowView` -- reuses the
 * EXISTING duty-analysis formatters from `lib/presentation/fairness.ts`
 * (`formatFairnessScore`/`formatFairnessDelta`/`formatFairnessGap`/
 * `formatFairnessWeekendCount`/`exemptionBadgeLabel`) unchanged, since a
 * duty row's score/target/delta/weekend/exemption shapes are identical to
 * what those already handle -- nothing duty-Fairness-specific to add here
 * beyond wiring `null` target -> `null` href-worthy state through.
 * `href` is `null` for an unresolved source name (same convention as
 * `ManagerFairnessRowCardView`) -- the card still displays fully, it just
 * isn't clickable into a detail overlay with no stable person id.
 */
export interface DutyFairnessCardView {
  key: string;
  personId: string | null;
  personName: string;
  /** Presentation-only Google avatar photo, `null` when none is known (including every row with `personId === null`) -- the card falls back to initials either way. */
  avatarUrl: string | null;
  href: string | null;
  allocationLabel: string;
  /** "הקצאות שבוצעו" -- the weighted completed-allocation total, formatted with the same clean-decimal rules as `currentLabel` (never forced trailing zeros). See `DutyFairnessPersonRowView.completedAllocationTotal`'s own docs for why it's independent of `status`/`targetLabel`, and for the two distinct reasons it can be "—". */
  completedAllocationLabel: string;
  currentLabel: string;
  targetLabel: string | null;
  deltaLabel: string;
  gapLabel: string | null;
  status: FairnessStatus | null;
  weekendLabel: string;
  exemptionBadges: string[];
}

export function buildDutyFairnessCardView(
  row: DutyFairnessPersonRowView,
  href: string | null,
): DutyFairnessCardView {
  return {
    key: row.key,
    personId: row.personId,
    personName: row.sourceName,
    avatarUrl: row.avatarUrl ?? null,
    href,
    allocationLabel: row.allocationLabel,
    completedAllocationLabel: formatFairnessScore(row.completedAllocationTotal),
    currentLabel: formatFairnessScore(row.currentScore),
    targetLabel: row.comparisonTarget !== null ? formatFairnessScore(row.comparisonTarget) : null,
    deltaLabel: formatFairnessDelta(row.delta),
    gapLabel: row.gapToTarget !== null ? formatFairnessGap(row.gapToTarget) : null,
    status: row.status,
    weekendLabel: formatFairnessWeekendCount(row.weekendCount),
    exemptionBadges: row.exemptions.map(exemptionBadgeLabel),
  };
}
