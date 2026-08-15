import type { Event } from "@/lib/domain/event";

/**
 * Logistics withdrawals (משיכות מהלוגיסטיקה) have no dedicated
 * `DutyFamily`/column/sheet anywhere in the current Google Sheet model
 * -- this was investigated and confirmed for PR #30 (see the PR
 * description). What DOES already exist: `lib/parsers/event.ts`'s
 * `classify()` runs a fixed priority order of small structured matchers
 * (shift, duty, absence, constraint, status, context) and -- by
 * design -- lets any cell text that matches NONE of them fall through
 * to `category: "other"`, preserving the exact text verbatim in
 * `Event.title` (see `classify()`'s own docstring: "unrecognized text
 * simply falls through to 'other'"). A person's schedule cell reading
 * "משיכות" or "משיכות מהלוגיסטיקה" is parsed by that SAME existing
 * pipeline (personnel -> schedule -> `parseEvent`) into a completely
 * ordinary `Event` with `category: "other"`, the correct `personId`,
 * and the correct `date` -- no new parser, no new Sheet column, no
 * separate manual-entry source.
 *
 * This module only adds a keyword filter over that already-existing,
 * already-parsed `Event` stream -- it never reaches into raw sheet
 * cells directly (matching the project's read-only, typed-domain-only
 * boundary) and never writes anything back to the Sheet.
 */
const LOGISTICS_WITHDRAWAL_KEYWORD = "משיכות";

/**
 * True for an `Event` whose free-text "other" classification names a
 * logistics-withdrawal assignment. A plain substring match on the
 * distinctive Hebrew word "משיכות" deliberately covers both the bare
 * phrasing and "משיכות מהלוגיסטיקה" without hard-coding one exact
 * string -- `event.title` is already whitespace/dash-normalized by
 * `parseEvent`, so this never needs to redo that normalization itself.
 */
export function isLogisticsWithdrawalEvent(event: Event): boolean {
  return event.category === "other" && event.title.includes(LOGISTICS_WITHDRAWAL_KEYWORD);
}
