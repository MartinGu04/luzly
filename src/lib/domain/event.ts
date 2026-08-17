export type EventCategory =
  | "shift"
  | "duty"
  | "absence"
  | "constraint"
  | "status"
  | "context"
  | "change_note"
  | "other"
  | "unknown";

export type EventRole = "supervisor" | "technician" | null;

export type EventPeriod = "day" | "night" | "morning" | "unspecified";

export type EventCertainty = "confirmed" | "tentative";

export type DutyFamily =
  | "guard"
  | "reserve"
  | "evacuation_on_call"
  | "full_kitchen"
  | "daily_kitchen"
  | "weekend_kitchen"
  | "rasar"
  | "oxid"
  | "callup";

/**
 * What kind of absence, for category === "absence" only. Lets rules engines
 * reason about absences without inspecting Hebrew raw text — e.g. "after" is
 * partial/ambiguous and must never be treated as a blocking full-day absence
 * the way vacation/abroad/medical/day_off are. "referral" (הפנייה/הפניה) was
 * previously unrepresented and fell through to `category: "other"`.
 */
export type AbsenceKind = "vacation" | "abroad" | "medical" | "day_off" | "after" | "referral";

/**
 * A single person/date cell, semantically classified from a
 * `RawAssignment`. This is what a future rules engine and the UI should
 * consume — never `RawSheet`/`RawAssignment` directly.
 *
 * `rawValue` always equals the source RawAssignment's rawValue exactly.
 * `title` is a normalized, display-friendly version of the same text
 * (whitespace/dash normalized, tentative "?" stripped) — never the other
 * way around.
 */
export interface Event {
  personId: string;
  personName: string;
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  title: string;
  rawValue: string;
  category: EventCategory;
  certainty: EventCertainty;
  role: EventRole;
  period: EventPeriod;
  sourceSheet: string;
  sourceCell: string;
  /** Guard/reserve duty slot number, e.g. "שומר 2" -> 2. Null otherwise. */
  slot: number | null;
  /** True for a shadow ("צל") shift. Metadata only — no coverage logic here. */
  shadow: boolean;
  /** "HH:mm" — set when the text overrides the shift's configured start time. */
  startTimeOverride: string | null;
  /** "HH:mm" — set when the text overrides the shift's configured end time. */
  endTimeOverride: string | null;
  /** The note text when category is "change_note"; null otherwise. */
  changeNote: string | null;
  dutyFamily: DutyFamily | null;
  /** Set only when category === "absence"; null otherwise. */
  absenceKind: AbsenceKind | null;
}
