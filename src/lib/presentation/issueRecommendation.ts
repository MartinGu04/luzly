import type { IssueReason } from "@/lib/domain/operationalIssues";
import type { MinuteInterval } from "@/lib/domain/shiftSchedule";
import type { ManagerIssueRecommendation } from "@/lib/readModels/managerTypes";
import { formatMissingIntervals } from "./scheduleTime";

/**
 * PR #37 -- Hebrew copy for the manager's "פעולה מומלצת" candidate search.
 * Mi-Ma-Mo is narrowing the search, never making the staffing decision: no
 * sentence here ever claims a person IS available (`זמין`/`פנוי`) or is
 * the best/optimal choice -- only that they may be "worth checking with"
 * against what the product can actually prove, with the limitation always
 * stated honestly (a private constraint communicated outside the product,
 * e.g. WhatsApp, is simply unknown to Mi-Ma-Mo).
 */

export interface IssueRecommendationLastResortView {
  /** "מוצא אחרון · הצג אפשרויות נוספות" -- the collapsed disclosure's own summary/trigger. */
  triggerLabel: string;
  text: string;
  disclaimer: string;
}

/**
 * `disclaimer` is paired 1:1 with `primaryText` -- set whenever `primaryText`
 * is an actual candidate suggestion, null when `primaryText` is instead the
 * "לא נמצאו טכנאים מתאימים" statement (nothing was suggested yet at that
 * level, so the personal-constraints caveat would be a non-sequitur there;
 * it still appears, combined with the last-resort framing, inside
 * `lastResort.disclaimer` once that nested section is opened).
 */
export interface IssueRecommendationView {
  primaryText: string;
  disclaimer: string | null;
  lastResort: IssueRecommendationLastResortView | null;
}

const CONSTRAINTS_DISCLAIMER = "ייתכנו אילוצים אישיים שלא מופיעים במערכת.";
const TECHNICIAN_NOT_FOUND_TEXT = "לא נמצאו טכנאים מתאימים לפי המידע הקיים.";
const LAST_RESORT_TRIGGER_LABEL = "מוצא אחרון · הצג אפשרויות נוספות";
const LAST_RESORT_DISCLAIMER = "האפשרויות האלו מוצגות כמוצא אחרון בלבד, וייתכנו אילוצים אישיים שלא מופיעים במערכת.";

/** "X" / "X או Y" / "X, Y או Z" -- never implies X is better than Y, just lists every candidate. */
function joinHebrewNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} או ${names[names.length - 1]}`;
}

/**
 * Only ever appended for `shift_coverage_partial` -- a `shift_coverage_missing`
 * gap is the whole canonical shift window, which the missing-coverage
 * sentence already implies without spelling out redundant start/end times.
 * Reuses `formatMissingIntervals` (the SAME formatting `IssueRow`'s own
 * "שעות חסרות"/"חסר כיסוי" callout already uses) -- never a second time
 * formatter, and only ever built from the canonical coverage analysis's
 * own `missingIntervals`, never guessed.
 */
function intervalSuffix(reason: IssueReason, missingIntervals: readonly MinuteInterval[] | null): string {
  if (reason !== "shift_coverage_partial" || !missingIntervals || missingIntervals.length === 0) return "";
  return ` בין ${formatMissingIntervals(missingIntervals).join(" · ")}`;
}

/**
 * Builds the final presentation copy from the safe `ManagerIssueRecommendation`
 * projection. Pure -- no data access, no eligibility logic (that already
 * happened in `lib/domain/shiftCoverageRecommendation.ts`); this only ever
 * turns an already-decided candidate list into restrained Hebrew sentences.
 *
 * Returns `null` whenever `recommendation` itself is `null` (an unsupported
 * issue reason, or the domain layer couldn't safely establish any
 * candidate) -- `IssueRow` then renders no recommendation UI at all, never
 * a placeholder.
 */
export function buildIssueRecommendationView(
  recommendation: ManagerIssueRecommendation | null,
  reason: IssueReason,
  missingIntervals: readonly MinuteInterval[] | null,
): IssueRecommendationView | null {
  if (!recommendation) return null;

  if (recommendation.primaryCandidates.length > 0) {
    const names = joinHebrewNames(recommendation.primaryCandidates.map((candidate) => candidate.personName));
    return {
      primaryText: `לפי הסידור הקיים, אפשר לבדוק עם ${names} לגבי הכיסוי${intervalSuffix(reason, missingIntervals)}.`,
      disclaimer: CONSTRAINTS_DISCLAIMER,
      lastResort: null,
    };
  }

  if (recommendation.missingRole === "technician" && recommendation.fallbackCandidates.length > 0) {
    const names = joinHebrewNames(recommendation.fallbackCandidates.map((candidate) => candidate.personName));
    const capabilityNote =
      recommendation.fallbackCandidates.length === 1
        ? "שמסומן גם כבעל יכולת טכנית"
        : "שמסומנים גם כבעלי יכולת טכנית";
    return {
      primaryText: TECHNICIAN_NOT_FOUND_TEXT,
      disclaimer: null,
      lastResort: {
        triggerLabel: LAST_RESORT_TRIGGER_LABEL,
        text: `לא נמצאו טכנאים רגילים מתאימים. לפי הסידור הקיים, אפשר לבדוק גם עם ${names}, ${capabilityNote}.`,
        disclaimer: LAST_RESORT_DISCLAIMER,
      },
    };
  }

  // Structurally unreachable given how `buildShiftCoverageRecommendation`
  // constructs its result (both candidate lists empty only ever produces
  // `null`, never a recommendation object) -- kept as a safe fallback
  // rather than assuming that invariant can never change silently.
  return null;
}
