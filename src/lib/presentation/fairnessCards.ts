import type { DutyPaceStatus } from "@/lib/domain/dutyPace";
import type { FairnessDataCompletenessReason, FairnessStatus } from "@/lib/domain/fairnessFoundation";
import type { PersonnelServiceCategory } from "@/lib/domain/personnelType";
import type { ShiftExpectationFactors } from "@/lib/domain/shiftExpectationFactors";
import {
  exemptionBadgeLabel,
  formatDutyPaceLabel,
  formatFairnessDelta,
  formatFairnessDeviationState,
  formatFairnessExpectedValue,
  formatFairnessGap,
  formatFairnessScore,
  formatFairnessWeekendCount,
  formatNormalizedLoad,
} from "@/lib/presentation/fairness";
import { dutyFamilyLabel } from "@/lib/presentation/labels";
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
  /**
   * Justice Table redesign -- a human-readable state ("בהתאם לצפוי" / "1
   * מתחת לצפוי" / "0.5 מעל הצפוי") instead of a raw signed gap number. This
   * is what the card/detail render for "Status" -- `deviationLabel` above
   * is kept only for callers that still need the raw signed figure.
   */
  statusStateLabel: string;
  weekendActualLabel: string;
  weekendTargetLabel: string | null;
  weekendDeviationLabel: string | null;
  weekendStatus: FairnessStatus | null;
  /** Same human-readable treatment as `statusStateLabel`, for the weekend deviation. */
  weekendStatusStateLabel: string;
  unavailableNote: string | null;
  /** Set only for a genuinely meaningful data-completeness gap -- see `shiftFairnessCompletenessNote`. Never a raw machine reason key. */
  completenessNote: string | null;
  /**
   * Justice Table redesign -- a short, concrete explanation of why THIS
   * person's expected value differs from a full-attendance peer (e.g. "3
   * ימי היעדרות · 1 אילוץ זמינות"), built from `row.expectationFactors`
   * (reliable Event-derived counts only -- see
   * `lib/domain/shiftExpectationFactors.ts`). `null` when there is nothing
   * to explain (no target, or every factor is zero) -- never invented.
   */
  expectationFactorLabel: string | null;
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

/**
 * Justice Table redesign -- "3 ימי היעדרות" / "1 אילוץ זמינות" / "2
 * הפניות", joined with " · ", each singular/plural-aware. Only factors that
 * are actually non-zero are shown; `null` (never an empty string) when
 * there is nothing to explain, so the caller can omit the affordance
 * entirely rather than showing an empty one.
 */
function buildExpectationFactorLabel(factors: ShiftExpectationFactors | null): string | null {
  if (!factors) return null;
  const parts: string[] = [];
  if (factors.leaveDays > 0) parts.push(`${factors.leaveDays} ${factors.leaveDays === 1 ? "יום היעדרות" : "ימי היעדרות"}`);
  if (factors.constraintDays > 0) {
    parts.push(`${factors.constraintDays} ${factors.constraintDays === 1 ? "אילוץ זמינות" : "אילוצי זמינות"}`);
  }
  if (factors.referralDays > 0) parts.push(`${factors.referralDays} ${factors.referralDays === 1 ? "הפניה" : "הפניות"}`);
  return parts.length > 0 ? parts.join(" · ") : null;
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
    targetLabel: row.target !== null ? formatFairnessExpectedValue(row.target) : null,
    deviationLabel: row.deviation !== null ? formatFairnessGap(row.deviation) : null,
    status: row.status,
    statusStateLabel: formatFairnessDeviationState(row.deviation, row.status),
    weekendActualLabel: String(row.weekendActualShifts),
    weekendTargetLabel: row.weekendTarget !== null ? formatFairnessExpectedValue(row.weekendTarget) : null,
    weekendDeviationLabel: row.weekendDeviation !== null ? formatFairnessGap(row.weekendDeviation) : null,
    weekendStatus: row.weekendStatus,
    weekendStatusStateLabel: formatFairnessDeviationState(row.weekendDeviation, row.weekendStatus),
    unavailableNote: row.target === null ? "לא ניתן לחשב יעד מלא לתקופה זו" : null,
    completenessNote: shiftFairnessCompletenessNote(row.dataCompleteness.reasons),
    expectationFactorLabel: buildExpectationFactorLabel(row.expectationFactors),
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
  /** Whether this row has a real, known comparison target at all -- `false` means the main card shows `noTargetNoteLabel` instead of a progress bar/percentage (never a misleading 0%/empty bar). */
  hasTarget: boolean;
  /** The raw `targetProgressRatio`, for the progress bar's own fill math -- can exceed `1`. `null` exactly when `hasTarget` is `false`. */
  progressRatio: number | null;
  /** "42%" -- `completedAllocationTotal / comparisonTarget`, reusing `formatNormalizedLoad`'s existing rounding. `"—"` when `hasTarget` is `false`. */
  progressPercentLabel: string;
  /** "3.6" points still remaining to reach the target -- clamped at 0 (see `beyondTargetLabel` for the over-target complement). `"—"` when unavailable. */
  remainingLabel: string;
  /** "1.0" points beyond the target, ONLY when the target was exceeded -- `null` otherwise (including when there is no target at all). */
  beyondTargetLabel: string | null;
  /** "מתחת לקצב" / "בקצב הצפוי" / "לפני הקצב" -- secondary to progress, `null` when pace cannot be computed. */
  paceLabel: string | null;
  /** The raw pace status backing `paceLabel`, for the UI's own pace-specific tinting (deliberately not the below/balanced/above `FairnessStatus` vocabulary). `null` exactly when `paceLabel` is `null`. */
  paceStatus: DutyPaceStatus | null;
  /** Set only when `hasTarget` is `false` -- distinguishes "this role has no target at all" from "the target note itself is temporarily missing", never a generic "0%"/empty bar. */
  noTargetNoteLabel: string | null;
  /** "שמירה 1 פעילה כרגע" -- a real, currently in-progress completion-based duty not yet reflected in `completedAllocationLabel`. `null` when nothing is currently live. */
  liveDutyLabel: string | null;
  /** Fixed companion text for `liveDutyLabel`, "points will be added when the duty is completed" -- `null` together with `liveDutyLabel`. */
  liveDutySubLabel: string | null;
}

const NO_TARGET_UNAVAILABLE_NOTE = "היעד לתקופה זו אינו זמין כרגע בנתונים.";
const NO_TARGET_ROLE_NOTE = "אין יעד מוגדר לתפקיד/הקצאה זו בתקופה הנוכחית.";

function buildNoTargetNote(row: DutyFairnessPersonRowView): string | null {
  if (row.comparisonTarget !== null) return null;
  return row.dataCompleteness.reasons.includes("duty_target_unavailable") ? NO_TARGET_UNAVAILABLE_NOTE : NO_TARGET_ROLE_NOTE;
}

function buildLiveDutyLabels(liveDuty: DutyFairnessPersonRowView["liveDuty"]): {
  liveDutyLabel: string | null;
  liveDutySubLabel: string | null;
} {
  if (!liveDuty) return { liveDutyLabel: null, liveDutySubLabel: null };
  const label = dutyFamilyLabel(liveDuty.dutyFamily) + (liveDuty.slot !== null ? ` ${liveDuty.slot}` : "");
  return { liveDutyLabel: `${label} פעילה כרגע`, liveDutySubLabel: "הנקודות יתווספו עם סיום התורנות" };
}

export function buildDutyFairnessCardView(
  row: DutyFairnessPersonRowView,
  href: string | null,
): DutyFairnessCardView {
  const hasTarget = row.comparisonTarget !== null;
  const { liveDutyLabel, liveDutySubLabel } = buildLiveDutyLabels(row.liveDuty);

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
    hasTarget,
    progressRatio: row.targetProgressRatio,
    progressPercentLabel: formatNormalizedLoad(row.targetProgressRatio),
    remainingLabel: formatFairnessScore(row.remainingToTarget !== null ? Math.max(row.remainingToTarget, 0) : null),
    beyondTargetLabel:
      row.remainingToTarget !== null && row.remainingToTarget < 0 ? formatFairnessScore(Math.abs(row.remainingToTarget)) : null,
    paceLabel: formatDutyPaceLabel(row.paceStatus),
    paceStatus: row.paceStatus,
    noTargetNoteLabel: buildNoTargetNote(row),
    liveDutyLabel,
    liveDutySubLabel,
  };
}
