import type { AbsenceKind, DutyFamily, EventCategory, EventPeriod } from "@/lib/domain/event";

/**
 * A small, FIXED 8-slot semantic color palette for calendar events --
 * "which of the small set of recognizable meanings is this", never a
 * color per raw `dutyFamily`/`absenceKind` enum member. Same input
 * contract as `emoji.ts`'s `AssignmentEmojiInput` (typed domain fields
 * only, never `rawValue`/`title` free text), and the SAME precedence
 * order (absence kind -> duty family -> shift period) -- but this is its
 * own, separately-reasoned mapping, not derived from the emoji choices.
 *
 * Deliberately not every `DutyFamily`/`AbsenceKind` gets a slot:
 * reserve/callup/rasar/oxid and medical/day_off stay unmapped (`null`),
 * same graceful-degradation contract as `assignmentEmoji` -- "a small,
 * coherent palette" was the explicit brief, not a rainbow of one color
 * per enum value. `null` always means "no color", never a guessed/
 * generic one.
 *
 * The 8 hues/hex values themselves live in `globals.css` as `--event-*`
 * tokens (light+dark), reusing this repo's own dataviz categorical-color
 * method (fixed hue order, CVD/contrast-validated against mi-ma-mo's
 * real light AND dark calendar surfaces) rather than hand-picked ones.
 * Applied ONLY as a soft background tint on the existing indicator chip
 * (`eventColorBgClassName`) -- never on text, never the sole identity
 * carrier. The emoji + short label stay the primary way to recognize an
 * event; color is a secondary "at a glance" scanning aid layered on top,
 * matching this app's existing restrained `--status-*-soft` tinting
 * convention (see `globals.css`).
 */
export interface EventColorInput {
  category: EventCategory;
  period: EventPeriod;
  dutyFamily: DutyFamily | null;
  absenceKind: AbsenceKind | null;
}

/** The 8 fixed semantic slots -- see the module doc for why exactly these 8 and not one per raw enum value. */
export type EventColorKey =
  | "shift-day"
  | "shift-night"
  | "vacation"
  | "after"
  | "referral"
  | "evacuation"
  | "guard"
  | "kitchen";

const DUTY_FAMILY_COLOR: Partial<Record<DutyFamily, EventColorKey>> = {
  guard: "guard",
  evacuation_on_call: "evacuation",
  full_kitchen: "kitchen",
  daily_kitchen: "kitchen",
  weekend_kitchen: "kitchen",
  // reserve/callup/rasar/oxid: outside the 8-slot palette -- left unmapped rather than stretching the palette to fit every enum value.
};

const ABSENCE_COLOR: Partial<Record<AbsenceKind, EventColorKey>> = {
  vacation: "vacation",
  abroad: "vacation",
  after: "after",
  referral: "referral",
  // medical/day_off: outside the 8-slot palette -- left unmapped.
};

/**
 * The semantic color slot for one event, or `null` when nothing in the
 * 8-slot palette applies (an unmapped duty/absence kind, a shift with
 * `period: "morning"`/`"unspecified"`, or any non-calendar category).
 * Precedence: absence kind -> duty family -> shift period, same order as
 * `assignmentEmoji`.
 */
export function eventColorKey(input: EventColorInput): EventColorKey | null {
  if (input.category === "absence" && input.absenceKind) {
    return ABSENCE_COLOR[input.absenceKind] ?? null;
  }
  if (input.category === "duty" && input.dutyFamily) {
    return DUTY_FAMILY_COLOR[input.dutyFamily] ?? null;
  }
  if (input.category === "shift") {
    if (input.period === "day") return "shift-day";
    if (input.period === "night") return "shift-night";
    // morning/unspecified: outside the 8-slot palette -- left unmapped.
  }
  return null;
}

const EVENT_COLOR_SOFT_BG_CLASS: Record<EventColorKey, string> = {
  "shift-day": "bg-event-shift-day-soft",
  "shift-night": "bg-event-shift-night-soft",
  vacation: "bg-event-vacation-soft",
  after: "bg-event-after-soft",
  referral: "bg-event-referral-soft",
  evacuation: "bg-event-evacuation-soft",
  guard: "bg-event-guard-soft",
  kitchen: "bg-event-kitchen-soft",
};

/**
 * The Tailwind soft-background-tint class for one event's semantic
 * color, or `null` for an unmapped event -- the caller then keeps its
 * own existing neutral background unchanged. Never a text color class:
 * this app's convention (see `globals.css`'s `--status-*` tokens) keeps
 * text on its own neutral ink tokens, colored marks/tints carry identity.
 */
export function eventColorBgClassName(input: EventColorInput): string | null {
  const key = eventColorKey(input);
  return key ? EVENT_COLOR_SOFT_BG_CLASS[key] : null;
}
