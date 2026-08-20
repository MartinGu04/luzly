import type { DutyBlockCertainty } from "@/lib/domain/dutyBlocks";
import type { LocalNow } from "@/lib/domain/localNow";
import type { PersonalDutyAction, PersonalDutyBlock } from "@/lib/readModels/types";
import { dutyFamilyEmoji } from "./emoji";
import { formatCompactDate } from "./hebrewDate";
import { dutyFamilyLabel } from "./labels";

/** "שמירה 2" -- the duty family's Hebrew label, with its slot appended only when the family actually has one. Never inspects `rawValue`/`title`. */
export function dutyBlockTitle(block: Pick<PersonalDutyBlock, "dutyFamily" | "slot">): string {
  const label = dutyFamilyLabel(block.dutyFamily);
  return block.slot !== null ? `${label} ${block.slot}` : label;
}

/** The block's semantic emoji, or null when the family intentionally has none -- never a guessed fallback. */
export function dutyBlockEmoji(block: Pick<PersonalDutyBlock, "dutyFamily">): string | null {
  return dutyFamilyEmoji(block.dutyFamily);
}

/**
 * "משוער" / "חלקית משוער" -- the only Hebrew copy a `DutyBlockCertainty`
 * value may ever surface as. A `confirmed` block gets no badge at all
 * (null), matching the rest of the app's "no badge for the unremarkable
 * case" convention. Centralized here so the raw enum string is never
 * rendered directly anywhere.
 */
export function dutyCertaintyLabel(certainty: DutyBlockCertainty): string | null {
  if (certainty === "tentative") return "משוער";
  if (certainty === "mixed") return "חלקית משוער";
  return null;
}

/**
 * A quiet "סופ"ש חלקי" flag for an incomplete weekend_kitchen run only --
 * never for any other duty family, and never treated as a critical/error
 * state. `weekendCompleteness` already encodes the domain's own
 * Thu-Fri-Sat completeness rule; this never re-derives or second-guesses
 * it, and never fabricates a missing day to "complete" the badge away.
 */
export function isWeekendKitchenPartial(block: Pick<PersonalDutyBlock, "dutyFamily" | "weekendCompleteness">): boolean {
  return block.dutyFamily === "weekend_kitchen" && block.weekendCompleteness === "partial";
}

export interface DutyBlockProgress {
  /** 1-based. */
  dayIndex: number;
  totalDays: number;
}

/**
 * "יום 2 מתוך 3" data for a block active on `todayDate` -- derived purely
 * from the index of `todayDate` inside the block's own actual `dates[]`
 * (never a computed day-count against startDate/endDate, which could be
 * wrong if a calendar hole exists). Returns null when `todayDate` isn't
 * actually one of the block's dates.
 */
export function dutyBlockProgress(
  block: Pick<PersonalDutyBlock, "dates">,
  todayDate: string,
): DutyBlockProgress | null {
  const index = block.dates.indexOf(todayDate);
  if (index === -1) return null;
  return { dayIndex: index + 1, totalDays: block.dates.length };
}

/**
 * Every `PersonalDutyAction` that genuinely belongs to `block`, matched
 * only through safe structured fields -- same `dutyFamily`, same `slot`,
 * and the action's date is one of the block's own actual `dates[]`. Never
 * raw-text matching. Because `deriveDutyActions` never generates an action
 * for a block's final day, a block's last date will simply never have a
 * matching action here -- this never fabricates one.
 */
export function actionsForBlock(
  block: Pick<PersonalDutyBlock, "dutyFamily" | "slot" | "dates">,
  actions: readonly PersonalDutyAction[],
): PersonalDutyAction[] {
  return actions.filter(
    (action) =>
      action.dutyFamily === block.dutyFamily &&
      action.slot === block.slot &&
      block.dates.includes(action.date),
  );
}

function clockToMinuteOfDay(clock: string): number {
  const [hourStr, minuteStr] = clock.split(":");
  return Number(hourStr) * 60 + Number(minuteStr);
}

/**
 * Presentation-only pending/due classification for a duty check-in action
 * -- deliberately separate from `deriveDutyActions()` (which only filters
 * by date, never by time-of-day). No `Date`/UTC anywhere:
 * - a future date is always pending
 * - a past date is never pending
 * - for today, pending iff the action's own local minute hasn't passed yet
 *   (still pending exactly AT its local time, e.g. 13:00 itself)
 */
export function isDutyActionPending(action: Pick<PersonalDutyAction, "date" | "localTime">, localNow: LocalNow): boolean {
  if (action.date > localNow.date) return true;
  if (action.date < localNow.date) return false;
  return clockToMinuteOfDay(action.localTime) >= localNow.minuteOfDay;
}

export interface DutyPendingSummary {
  /** "בדיקה" for exactly one pending action due today, "בדיקות" otherwise. */
  label: string;
  /** Already-formatted "היום · 13:00" / "16.8 · 13:00" entries, chronological. */
  items: string[];
}

/**
 * A compact, friendly summary of a block's still-pending check-in actions
 * -- never presented as an actual push notification, just informational
 * copy. Returns null once nothing is pending (a finished block, or a
 * block whose only actions have already passed today).
 */
export function summarizePendingActions(
  matchedActions: readonly PersonalDutyAction[],
  localNow: LocalNow,
): DutyPendingSummary | null {
  const pending = matchedActions.filter((action) => isDutyActionPending(action, localNow));
  if (pending.length === 0) return null;

  const items = pending.map((action) =>
    action.date === localNow.date ? `היום · ${action.localTime}` : `${formatCompactDate(action.date)} · ${action.localTime}`,
  );
  const label = pending.length === 1 && pending[0].date === localNow.date ? "בדיקה" : "בדיקות";
  return { label, items };
}

export type DutyFocusStatus = "active" | "next" | "none";

export interface DutyFocus {
  status: DutyFocusStatus;
  /** Every block sharing the focus state -- an active/next duty is never assumed to be singular. */
  blocks: PersonalDutyBlock[];
}

/**
 * The screen's headline state: every block active right now, or (if none)
 * every block sharing the single earliest future start date, or none.
 * "Active" is decided ONLY by `block.dates.includes(todayDate)` -- never
 * inferred from startDate/endDate alone (which would wrongly treat a
 * calendar hole as still-active), and never from raw text. No Date/UTC.
 */
export function selectDutyFocus(blocks: readonly PersonalDutyBlock[], todayDate: string): DutyFocus {
  const active = blocks.filter((block) => block.dates.includes(todayDate));
  if (active.length > 0) return { status: "active", blocks: active };

  const future = blocks.filter((block) => block.startDate > todayDate);
  if (future.length === 0) return { status: "none", blocks: [] };

  const earliestStart = future.reduce(
    (min, block) => (block.startDate < min ? block.startDate : min),
    future[0].startDate,
  );
  return { status: "next", blocks: future.filter((block) => block.startDate === earliestStart) };
}

/**
 * The "remaining upcoming" list for the duties screen: every block still
 * relevant (`endDate >= todayDate`) EXCLUDING whichever blocks are already
 * shown in the focus section, so the screen never repeats itself.
 * Exclusion is by reference (the focus blocks are the exact same array
 * elements `selectDutyFocus` returned), never by a re-derived signature.
 * Chronological by start date -- with all actives already carved out into
 * focus, nothing here can ever be "active", so this is inherently already
 * "active first, then chronological".
 */
export function remainingUpcomingBlocks(
  blocks: readonly PersonalDutyBlock[],
  focusBlocks: readonly PersonalDutyBlock[],
  todayDate: string,
): PersonalDutyBlock[] {
  const focusSet = new Set(focusBlocks);
  return blocks
    .filter((block) => block.endDate >= todayDate && !focusSet.has(block))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

const DEFAULT_HISTORY_LIMIT = 12;

/**
 * A bounded, newest-first slice of finished duty blocks (`endDate <
 * todayDate`) -- deliberately never the person's entire workbook history.
 */
export function historyBlocks(
  blocks: readonly PersonalDutyBlock[],
  todayDate: string,
  limit = DEFAULT_HISTORY_LIMIT,
): PersonalDutyBlock[] {
  return blocks
    .filter((block) => block.endDate < todayDate)
    .sort((a, b) => (a.endDate > b.endDate ? -1 : a.endDate < b.endDate ? 1 : 0))
    .slice(0, limit);
}

export type DutyView = "upcoming" | "history";

/** Strict allowlist parse of the `?view=` query param -- anything but the literal "history" falls back to "upcoming". */
export function parseDutyView(raw: string | undefined): DutyView {
  return raw === "history" ? "history" : "upcoming";
}
