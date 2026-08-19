import type { AbsenceKind, DutyFamily, EventCategory, EventPeriod } from "@/lib/domain/event";
import { eventColorKey, type EventColorKey } from "@/lib/presentation/eventColor";

export interface IcsColorInput {
  category: EventCategory;
  period: EventPeriod;
  dutyFamily: DutyFamily | null;
  absenceKind: AbsenceKind | null;
}

/**
 * RFC 7986 §5.9 `COLOR` value for one event -- reuses the SAME semantic
 * slot decision `eventColorKey` (`lib/presentation/eventColor.ts`) already
 * makes for the in-app "הלוח שלי" calendar, rather than a second, unrelated
 * classification. Unlike `icsEmoji.ts` (which deliberately keeps its OWN
 * separate emoji table, because a few of its symbols intentionally differ
 * from the UI's), this is a genuine reuse: the MEANING of which event gets
 * which color is decided exactly once.
 *
 * What differs here is only the output FORMAT: RFC 7986 requires `COLOR`'s
 * value to be a CSS3 extended color keyword (TEXT), never an arbitrary hex
 * -- so each of the 8 palette slots is mapped to its closest keyword below,
 * an approximation of the same hue, not a re-decision of which category
 * means which color.
 *
 * Best-effort only, matching this feed's existing "hints, not guarantees"
 * posture (see `icsRender.ts`'s docstring on `REFRESH-INTERVAL`): `COLOR`
 * is a SHOULD in RFC 7986, not a MUST, and real client support is
 * inconsistent -- Apple Calendar reads it; Google Calendar's ICS
 * subscription import ignores it. A client that ignores this property
 * sees an otherwise completely unaffected feed -- no other field depends
 * on it, and its absence/presence never changes SUMMARY, timing, or UID.
 */
const EVENT_COLOR_KEYWORD: Record<EventColorKey, string> = {
  "shift-day": "goldenrod",
  "shift-night": "royalblue",
  vacation: "seagreen",
  after: "chocolate",
  referral: "palevioletred",
  evacuation: "indianred",
  guard: "darkslateblue",
  kitchen: "green",
};

/** The `COLOR` keyword for one event, or `null` when it's outside the 8-slot palette -- the caller then omits the property entirely, never a default/guessed color. */
export function icsEventColor(input: IcsColorInput): string | null {
  const key = eventColorKey(input);
  return key ? EVENT_COLOR_KEYWORD[key] : null;
}
