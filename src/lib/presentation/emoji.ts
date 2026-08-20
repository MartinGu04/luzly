import type { AbsenceKind, DutyFamily, EventCategory, EventPeriod } from "@/lib/domain/event";

/**
 * One central, restrained semantic-emoji mapping -- every emoji decision
 * in the UI goes through here, never scattered ad hoc per component.
 *
 * Only maps KNOWN typed domain fields (category/period/dutyFamily/
 * absenceKind) -- never inferred from fuzzy Hebrew `rawValue`/`title`
 * text, which is why this takes a small structural shape instead of a
 * full `Event`/`PersonalEventView`. Unknown/unmapped semantics return
 * null rather than guessing.
 */
export interface AssignmentEmojiInput {
  category: EventCategory;
  period: EventPeriod;
  dutyFamily: DutyFamily | null;
  absenceKind: AbsenceKind | null;
}

const DUTY_FAMILY_EMOJI: Partial<Record<DutyFamily, string>> = {
  guard: "💂",
  reserve: "🪖",
  evacuation_on_call: "🚑",
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
  after: "🌅",
  referral: "🩺",
  // medical/day_off: no fitting calm symbol -- left unmapped.
};

/**
 * The single semantic emoji for one assignment/event, or null when
 * nothing specific is known for it. Precedence: absence kind -> duty
 * family -> shift period. Never invents a symbol for `other`/`unknown`
 * categories or an unmapped enum value.
 */
export function assignmentEmoji(input: AssignmentEmojiInput): string | null {
  if (input.category === "absence" && input.absenceKind) {
    return ABSENCE_EMOJI[input.absenceKind] ?? null;
  }
  if (input.category === "duty" && input.dutyFamily) {
    return DUTY_FAMILY_EMOJI[input.dutyFamily] ?? null;
  }
  if (input.category === "shift") {
    if (input.period === "day") return "☀️";
    if (input.period === "night") return "🌙";
    if (input.period === "morning") return "🌅";
  }
  return null;
}

/** Emoji for a duty family alone (e.g. for `PersonalDutyBlock`/`PersonalDutyAction`, which don't carry a full Event shape). */
export function dutyFamilyEmoji(dutyFamily: DutyFamily): string | null {
  return DUTY_FAMILY_EMOJI[dutyFamily] ?? null;
}

/**
 * Known personal "activity" title text -> emoji, for category `"status"`/
 * `"other"` events (informational calendar entries -- see
 * `lib/readModels/buildPersonalScheduleReadModel.ts`'s
 * `isPersonalCalendarActivityEvent`). These events have no further typed
 * classification beyond their own display text (`STATUS_PHRASES`/the
 * "other" fallback in `lib/parsers/event.ts` never structure them any
 * further), so this is the ONE deliberate exception to this module's
 * "never key off rawValue/title" rule -- there is no other typed field to
 * key off for them. Only a small, fixed set of EXACT known phrases is
 * matched (never fuzzy/substring), and `personalActivityEmoji` always
 * returns a usable emoji (the restrained `📌` pin) for anything else, so a
 * brand-new, never-seen activity text is never left unlabeled.
 */
const PERSONAL_ACTIVITY_EMOJI: Record<string, string> = {
  סוגר: "🔒",
  "שלב 9": "🎓",
  "שלב 11": "🎓",
  "כנס בטיחות": "🦺",
  'כנס יוהל"ם': "📌",
};

const GENERIC_PERSONAL_ACTIVITY_EMOJI = "📌";

/** The emoji for one personal-activity title -- a known phrase's own symbol, or the generic pin fallback for anything unrecognized. */
export function personalActivityEmoji(title: string): string {
  return PERSONAL_ACTIVITY_EMOJI[title] ?? GENERIC_PERSONAL_ACTIVITY_EMOJI;
}
