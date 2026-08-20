import type { AbsenceKind, DutyFamily, EventCategory, EventPeriod } from "@/lib/domain/event";

/**
 * ONE centralized emoji mapping for the external ICS feed's `SUMMARY`
 * prefixes -- every emoji decision in this feature goes through here,
 * never scattered per-event-type string matching in `icsItems.ts`. Reads
 * only KNOWN typed domain fields (category/period/dutyFamily/absenceKind),
 * never `rawValue`/`title` free text, so this can never be fooled by an
 * unusual raw cell value and never needs to match an "arbitrary display
 * string".
 *
 * Deliberately a SEPARATE table from `lib/presentation/emoji.ts`'s
 * `assignmentEmoji` (the in-app UI's own mapping), not a reuse of it --
 * a few of THIS feed's requested symbols (🛡️ guard, 📞 evacuation_on_call,
 * 🏠 after) intentionally differ from the UI's existing choices (💂, 🚑,
 * 🌅), so reusing that function verbatim would have silently produced the
 * wrong symbols here. Every value NOT explicitly requested for the feed
 * (reserve, callup, rasar, oxid, shift-morning, absence-abroad) reuses the
 * UI's own already-established choice rather than inventing a new one;
 * every value with genuinely no fitting symbol in either place (absence-
 * medical, absence-day_off, shift-unspecified) stays unmapped -- see
 * `icsEventEmoji`'s own docstring for the graceful-degradation contract.
 * This file has zero effect on the in-app "הלוח שלי" UI, which still goes
 * through `lib/presentation/emoji.ts` alone, unchanged.
 */
export interface IcsEmojiInput {
  category: EventCategory;
  period: EventPeriod;
  dutyFamily: DutyFamily | null;
  absenceKind: AbsenceKind | null;
}

const DUTY_FAMILY_EMOJI: Partial<Record<DutyFamily, string>> = {
  guard: "🛡️",
  reserve: "🪖",
  evacuation_on_call: "📞",
  full_kitchen: "🍽️",
  daily_kitchen: "🍽️",
  weekend_kitchen: "🍽️",
  callup: "📞",
  rasar: "🧹",
  oxid: "📄",
};

const ABSENCE_EMOJI: Partial<Record<AbsenceKind, string>> = {
  vacation: "🏖️",
  abroad: "🏖️",
  after: "🏠",
  referral: "🩺",
  // medical/day_off: no fitting symbol, same as the UI's own mapping -- left unmapped.
};

/**
 * The single emoji to prefix an ICS `SUMMARY` with, or `null` when nothing
 * confident is known -- a `null` result means the SUMMARY is rendered with
 * NO emoji prefix at all (never a placeholder/generic icon, never a
 * guess), which is exactly what "degrade gracefully" means here: ICS
 * generation is never affected either way, only whether the summary text
 * happens to start with an emoji.
 *
 * Only `shift`/`duty`/`absence` ever reach this at all (every other
 * `EventCategory` is filtered out before `icsItems.ts` builds a calendar
 * item, via `isCalendarDisplayEvent`), so those are the only three
 * branches below.
 */
export function icsEventEmoji(input: IcsEmojiInput): string | null {
  if (input.category === "absence") {
    return input.absenceKind ? (ABSENCE_EMOJI[input.absenceKind] ?? null) : null;
  }
  if (input.category === "duty") {
    return input.dutyFamily ? (DUTY_FAMILY_EMOJI[input.dutyFamily] ?? null) : null;
  }
  if (input.category === "shift") {
    if (input.period === "day") return "☀️";
    if (input.period === "night") return "🌙";
    if (input.period === "morning") return "🌅";
  }
  return null;
}

/** Prefixes `text` with `emoji` + a space, or returns `text` unchanged when `emoji` is `null`. The one place this feed ever combines an emoji with a summary string. */
export function withEmojiPrefix(emoji: string | null, text: string): string {
  return emoji ? `${emoji} ${text}` : text;
}
