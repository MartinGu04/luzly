import type { FairnessDataCompletenessReason, FairnessStatus } from "@/lib/domain/fairnessFoundation";
import type { PersonnelServiceCategory } from "@/lib/domain/personnelType";
import type { ShiftExpectationFactors } from "@/lib/domain/shiftExpectationFactors";
import {
  exemptionBadgeLabel,
  formatDutyStatusLabel,
  formatFairnessDelta,
  formatFairnessDeviationState,
  formatFairnessExpectedValue,
  formatFairnessGap,
  formatFairnessScore,
  formatFairnessWeekendCount,
  formatNormalizedLoad,
  resolveDutyStatusState,
  type DutyStatusState,
} from "@/lib/presentation/fairness";
import { dutyFamilyLabel } from "@/lib/presentation/labels";
import { fairnessShiftStatusLabel } from "@/lib/presentation/fairnessStatus";
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
   * The short badge word ("מעל הצפוי" / "מתחת לצפוי" / "מאוזן" / "לא ניתן
   * להשוות") -- `fairnessShiftStatusLabel`'s own "EXPECTED", never "TARGET",
   * vocabulary, since `target` here is an adjusted expectation up to today,
   * not a fixed monthly quota. Kept as its OWN field, separate from
   * `statusStateLabel` below, because the badge is a quick-glance word with
   * no magnitude while `statusStateLabel` also carries the rounded gap size.
   */
  statusLabel: string;
  /**
   * Justice Table redesign -- a human-readable state ("בהתאם לצפוי" / "1
   * מתחת לצפוי" / "0.5 מעל הצפוי") instead of a raw signed gap number. This
   * is what the card/detail render for "Status" -- `deviationLabel` above
   * is kept only for callers that still need the raw signed figure.
   */
  statusStateLabel: string;
  /**
   * One short, calm sentence explaining what the deviation means (e.g. "you
   * completed more shifts than expected relative to your availability up to
   * today") -- deliberately never phrased in terms of effort ("worked
   * harder"), since this measures shift ALLOCATION relative to genuine
   * opportunity, not difficulty. `null` exactly when `status` is `null`
   * (nothing to explain -- the comparison itself isn't available).
   */
  statusExplanationLabel: string | null;
  /** Distinct weekends worked (`row.weekendsWorked`), NOT a weekend shift-slot count -- see that field's own docs. */
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

/**
 * "You completed more/fewer shifts than expected relative to your
 * availability up to today" -- one calm, concrete sentence answering "what
 * does this deviation actually mean", so the gap number is never left to
 * speak for itself. Deliberately never "worked harder"/"worked less" --
 * this measures shift ALLOCATION against genuine recorded opportunity, not
 * effort or difficulty. `null` exactly when `status` is `null` (the
 * comparison itself isn't available, so there is nothing to explain).
 *
 * `isCurrentMonth` mirrors `shiftFairnessPeriodLabel`'s own "עד היום"
 * convention EXACTLY (same page-level `isOnCurrentMonth` signal, never
 * `periodStatus` -- a wholly future month is also `periodStatus: "current"`,
 * which is NOT "today"): only the actual current calendar month's target is
 * genuinely an "up to today" figure, so only that case names "today". A
 * closed historical month or a future month's target covers the WHOLE
 * period instead, so the sentence names "this period" rather than making a
 * false "as of today" claim about a month that already ended or hasn't
 * started.
 */
function buildShiftStatusExplanationLabel(status: FairnessStatus | null, isCurrentMonth: boolean): string | null {
  const timeframe = isCurrentMonth ? "עד היום" : "בתקופה זו";
  if (status === "above") return `ביצעת יותר משמרות מהצפוי, ביחס לזמינות שהייתה לך ${timeframe}.`;
  if (status === "below") return `ביצעת פחות משמרות מהצפוי, ביחס לזמינות שהייתה לך ${timeframe}.`;
  if (status === "balanced") return `ביצעת משמרות בהתאם לצפוי, ביחס לזמינות שהייתה לך ${timeframe}.`;
  return null;
}

export function buildShiftFairnessCardView(
  row: ShiftFairnessPersonRowView,
  href: string,
  isCurrentMonth: boolean = true,
): ShiftFairnessCardView {
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
    statusLabel: fairnessShiftStatusLabel(row.status),
    statusStateLabel: formatFairnessDeviationState(row.deviation, row.status),
    statusExplanationLabel: buildShiftStatusExplanationLabel(row.status, isCurrentMonth),
    weekendActualLabel: String(row.weekendsWorked),
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
  /** The workbook's own role-based X/2X comparison target ("יעד השוואה") -- the ORIGINAL, unchanged Duty Fairness feature (detail overlay only). NEVER the progress bar's own denominator -- see `personalTargetLabel` for that. */
  targetLabel: string | null;
  deltaLabel: string;
  gapLabel: string | null;
  status: FairnessStatus | null;
  weekendLabel: string;
  exemptionBadges: string[];
  /**
   * Justice Table redesign, corrected -- this person's own workbook target
   * (the "ניקוד לפוטנציאל הנוכחי" column), formatted
   * (`DutyFairnessPersonRowView.personalTargetTotal`). This, NEVER
   * `targetLabel` above, is the progress bar's denominator -- two people
   * sharing the same `allocationLabel` can have different values here,
   * because the workbook publishes a personal figure for each of them.
   * `null` exactly when `hasTarget` is `false`.
   */
  personalTargetLabel: string | null;
  /** Whether this row has a real, known personal published-potential target at all -- `false` means the main card shows `noTargetNoteLabel` instead of a progress bar/percentage (never a misleading 0%/empty bar). */
  hasTarget: boolean;
  /** The raw `targetProgressRatio`, for the progress bar's own fill math -- can exceed `1`. `null` exactly when `hasTarget` is `false`. */
  progressRatio: number | null;
  /** "42%" -- `completedAllocationTotal / personalTargetTotal`, reusing `formatNormalizedLoad`'s existing rounding. `"—"` when `hasTarget` is `false`. */
  progressPercentLabel: string;
  /** "3.6" points still remaining to reach the target -- clamped at 0 (see `beyondTargetLabel` for the over-target complement). `"—"` when unavailable. */
  remainingLabel: string;
  /** "1.0" points beyond the target, ONLY when the target was exceeded -- `null` otherwise (including when there is no target at all). */
  beyondTargetLabel: string | null;
  /**
   * "טרם בוצעו תורנויות" / "מתחת לצפי" / "בהתאם לצפי" / "מעל לצפי" /
   * "היעד הושלם" / "מעבר ליעד" -- the ONE mutually-exclusive "how are they
   * doing" state (`resolveDutyStatusState`'s own docs for the full
   * precedence), secondary to progress. `null` when it cannot be computed
   * (no target, or completed work unknown).
   */
  dutyStatusLabel: string | null;
  /** The raw state backing `dutyStatusLabel`, for the UI's own tinting (deliberately not the below/balanced/above `FairnessStatus` vocabulary). `null` exactly when `dutyStatusLabel` is `null`. */
  dutyStatusState: DutyStatusState | null;
  /** Set only when `hasTarget` is `false` -- distinguishes "this role has no target at all" from "the target note itself is temporarily missing", never a generic "0%"/empty bar. */
  noTargetNoteLabel: string | null;
  /** "שמירה 1 פעילה כרגע" -- a real, currently in-progress completion-based duty not yet reflected in `completedAllocationLabel`. `null` when nothing is currently live. */
  liveDutyLabel: string | null;
  /** Fixed companion text for `liveDutyLabel`, "points will be added when the duty is completed" -- `null` together with `liveDutyLabel`. */
  liveDutySubLabel: string | null;
}

const NO_TARGET_UNAVAILABLE_NOTE = "היעד האישי אינו זמין כרגע בנתונים.";
const NO_TARGET_ROLE_NOTE = "אין תורנויות משובצות לפוטנציאל המפורסם בתקופה זו.";

/**
 * Justice Table redesign, corrected -- `personalTargetTotal === null` means
 * the workbook's own "ניקוד לפוטנציאל הנוכחי" cell for this row is itself
 * unavailable ("-"/blank). A real `0` is a DIFFERENT, complete fact -- the
 * workbook itself publishes zero for this person this period -- never
 * conflated with the gap above.
 */
function buildNoTargetNote(row: DutyFairnessPersonRowView): string | null {
  if (row.personalTargetTotal === null) return NO_TARGET_UNAVAILABLE_NOTE;
  if (row.personalTargetTotal === 0) return NO_TARGET_ROLE_NOTE;
  return null;
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
  // Justice Table redesign -- the progress bar's own "has a target at all"
  // question is about THIS person's personalTargetTotal (the workbook's
  // own "ניקוד לפוטנציאל הנוכחי" value), never the workbook's role-based
  // comparisonTarget (which stays exactly as it was for the detail
  // overlay's targetLabel/gapLabel/status below).
  const hasTarget = row.personalTargetTotal !== null && row.personalTargetTotal > 0;
  const { liveDutyLabel, liveDutySubLabel } = buildLiveDutyLabels(row.liveDuty);
  const dutyStatusState = resolveDutyStatusState(row.completedAllocationTotal, row.personalTargetTotal, row.paceStatus);

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
    personalTargetLabel: row.personalTargetTotal !== null ? formatFairnessScore(row.personalTargetTotal) : null,
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
    dutyStatusLabel: formatDutyStatusLabel(dutyStatusState),
    dutyStatusState,
    noTargetNoteLabel: buildNoTargetNote(row),
    liveDutyLabel,
    liveDutySubLabel,
  };
}
