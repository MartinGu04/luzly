import { nextCalendarDateString } from "./operationalWeek";
import { classifyPersonnelType, classifyRoleGroup } from "./personnelType";
import type { AbsenceKind, Event } from "./event";
import { BLOCKING_ABSENCE_KINDS } from "./operationalIssues";
import type { LocalNow } from "./localNow";
import type { Person } from "./types";

/**
 * "דוח 1 למחר" -- a manager-editable draft summarizing tomorrow's personnel
 * status, grouped into the four fixed sections the report always uses (see
 * `SECTION_ORDER` below). Consumes the SAME typed `Event[]` every other
 * schedule-aware feature in this app consumes (never a second, independent
 * parse of raw schedule cells) -- see this module's own doc comments on
 * `resolveRegularOrReserveStatus` for exactly which existing domain
 * concepts it reuses.
 */
export type ReportOneSection = "permanent" | "reserve" | "regular_manager" | "regular_technician";

export interface ReportOnePerson {
  personId: string;
  name: string;
  section: ReportOneSection;
  generatedStatus: string;
}

export interface ReportOneSectionGroup {
  section: ReportOneSection;
  /** The exact Hebrew section header text, emoji + trailing colon included. */
  label: string;
  people: ReportOnePerson[];
}

export interface ReportOneDraft {
  /** "YYYY-MM-DD" -- always tomorrow in Asia/Jerusalem (see `resolveReportOneTargetDate`). */
  targetDate: string;
  sections: ReportOneSectionGroup[];
}

export const REPORT_ONE_SECTION_ORDER: readonly ReportOneSection[] = [
  "permanent",
  "reserve",
  "regular_manager",
  "regular_technician",
];

const SECTION_LABELS: Record<ReportOneSection, string> = {
  permanent: "אנשי קבע💛:",
  reserve: "מילואים😍:",
  regular_manager: 'סדיר - אחמשים🧑🏻‍💻:',
  regular_technician: 'סדיר - טכנאים🧑🏻‍🔧:',
};

export const UNKNOWN_REPORT_ONE_STATUS = "?";

/**
 * Personnel permanently excluded from Report 1 regardless of section,
 * schedule, or personnel status (product decision, not a data-quality
 * filter). Matched on a normalized display name -- the SAME whitespace
 * normalization `stableIdFromName` (`lib/parsers/personnel.ts`) applies
 * before hashing a `Person.id`, so this is equivalent to an id-based match
 * without this domain module reaching into `lib/parsers` (layers stay
 * separated per this repo's engineering rules).
 */
const EXCLUDED_REPORT_ONE_NAMES: ReadonlySet<string> = new Set(
  ["דימה מירו", "מרטין בדיקות", "נדב וקנין"].map(normalizePersonName),
);

function normalizePersonName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function isExcludedFromReportOne(person: Person): boolean {
  return EXCLUDED_REPORT_ONE_NAMES.has(normalizePersonName(person.name));
}

/**
 * Which Report 1 section (if any) a person belongs to, from the SAME
 * `classifyPersonnelType`/`classifyRoleGroup` domain functions the roster
 * hierarchy (`lib/presentation/roster.ts`) and fairness grouping already
 * use -- never a parallel classification. A רגיל/סדיר person who is
 * neither אחמ"ש nor טכנאי (`classifyRoleGroup` -> "other") has no Report 1
 * section and is not included -- the report only ever has these four fixed
 * sections, never a fifth "other" bucket.
 */
export function classifyReportOneSection(person: Person): ReportOneSection | null {
  const category = classifyPersonnelType(person.personnelType);

  if (category === "permanent") return "permanent";
  if (category === "reserve") return "reserve";
  if (category === "regular") {
    const roleGroup = classifyRoleGroup(person);
    if (roleGroup === "supervisor") return "regular_manager";
    if (roleGroup === "technician") return "regular_technician";
    return null;
  }
  return null;
}

/** "YYYY-MM-DD" for tomorrow, given today's Asia/Jerusalem `LocalNow` -- pure string arithmetic, never `Date`/UTC (see `nextCalendarDateString`). `now.date` is trusted to already be valid (it comes from `getJerusalemLocalNow()`), matching the same trust convention `resolveCurrentShiftPeriod` uses. */
export function resolveReportOneTargetDate(now: LocalNow): string {
  const target = nextCalendarDateString(now.date);
  if (!target) {
    throw new Error(`Invalid local date: "${now.date}".`);
  }
  return target;
}

function isAssignmentEvent(event: Event): boolean {
  return event.category === "shift" || event.category === "duty";
}

function isBlockingAbsence(event: Event): event is Event & { absenceKind: AbsenceKind } {
  return event.category === "absence" && event.absenceKind !== null && BLOCKING_ABSENCE_KINDS.has(event.absenceKind);
}

const BLOCKING_ABSENCE_WORDING: Partial<Record<AbsenceKind, string>> = {
  vacation: "חופש",
  day_off: "יום סידורים",
  abroad: 'חו"ל',
  medical: "גימלים",
};

function shiftStatusWording(role: "supervisor" | "technician", period: "day" | "night"): string {
  if (role === "supervisor") return period === "day" ? 'נוכח, אחמ"ש יום' : 'נוכח, אחמ"ש לילה';
  return period === "day" ? "נוכח, טכנאי יום" : "נוכח, טכנאי לילה";
}

const AFTER_NIGHT_STATUS = "נוכח, אחרי לילה";

/**
 * Resolves one סדיר/מילואים person's Report 1 status for `targetDate` from
 * their own already-typed `Event[]` on `targetDate` and the immediately
 * preceding calendar date -- never a fresh parse, never a guess. Reuses:
 *
 * - `Event.category`/`role`/`period`/`absenceKind`, exactly as
 *   `lib/parsers/event.ts` already classified them from the schedule sheet;
 * - `BLOCKING_ABSENCE_KINDS` (`lib/domain/operationalIssues.ts`), the SAME
 *   set `detectBlockingAbsenceIssues` uses to flag a person as having both
 *   a blocking absence and a real assignment on one date -- when that
 *   conflict is present here too, this returns "?" rather than inventing
 *   a precedence the rest of the app doesn't have (never a person shown as
 *   both on leave and on a shift);
 * - the day/night shift-carryover structure `lib/domain/shiftSchedule.ts`
 *   documents (a night shift's 12h window always runs from that day's
 *   shift-end into the FOLLOWING calendar date, regardless of the
 *   configured start time) -- a night-period shift dated the day before
 *   `targetDate` is read as "still present, after that night" on
 *   `targetDate` without needing to resolve exact minutes.
 *
 * Returns "?" whenever the available Events don't unambiguously resolve to
 * one of the report's known phrasings -- never a silent guess.
 */
export function resolveRegularOrReserveStatus(
  eventsToday: readonly Event[],
  eventsPrevDay: readonly Event[],
): string {
  const assignmentsToday = eventsToday.filter(isAssignmentEvent);
  const blockingAbsencesToday = eventsToday.filter(isBlockingAbsence);
  const referralsToday = eventsToday.filter((event) => event.category === "absence" && event.absenceKind === "referral");

  if (blockingAbsencesToday.length > 0) {
    if (assignmentsToday.length > 0) return UNKNOWN_REPORT_ONE_STATUS;
    const distinctKinds = new Set(blockingAbsencesToday.map((event) => event.absenceKind));
    if (distinctKinds.size > 1) return UNKNOWN_REPORT_ONE_STATUS;
    const kind = blockingAbsencesToday[0].absenceKind as AbsenceKind;
    return BLOCKING_ABSENCE_WORDING[kind] ?? UNKNOWN_REPORT_ONE_STATUS;
  }

  if (referralsToday.length > 0) {
    if (assignmentsToday.length > 0) return UNKNOWN_REPORT_ONE_STATUS;
    return "הפנייה";
  }

  const shiftEventsToday = eventsToday.filter((event) => event.category === "shift");
  if (shiftEventsToday.length > 0) {
    const wordings = new Set(
      shiftEventsToday
        .filter(
          (event): event is Event & { role: "supervisor" | "technician"; period: "day" | "night" } =>
            (event.role === "supervisor" || event.role === "technician") &&
            (event.period === "day" || event.period === "night"),
        )
        .map((event) => shiftStatusWording(event.role, event.period)),
    );
    if (wordings.size === 1) return [...wordings][0];
    return UNKNOWN_REPORT_ONE_STATUS;
  }

  const hasAfterMarkerToday = eventsToday.some(
    (event) => event.category === "absence" && event.absenceKind === "after",
  );
  const hasNightShiftPrevDay = eventsPrevDay.some(
    (event) =>
      event.category === "shift" &&
      event.period === "night" &&
      (event.role === "supervisor" || event.role === "technician"),
  );
  if (hasAfterMarkerToday || hasNightShiftPrevDay) return AFTER_NIGHT_STATUS;

  return UNKNOWN_REPORT_ONE_STATUS;
}

export interface BuildReportOneDraftInput {
  /** Full parsed roster, in the authoritative source's own stable order -- never reordered. */
  people: readonly Person[];
  /** Full parsed Event set (every person, every date) -- only `targetDate`/`prevDate` entries are ever read. */
  events: readonly Event[];
  /** "YYYY-MM-DD" -- tomorrow (see `resolveReportOneTargetDate`). */
  targetDate: string;
  /** "YYYY-MM-DD" -- the calendar date immediately before `targetDate` (i.e. today), for after-night carryover. */
  prevDate: string;
}

/**
 * Builds the full `ReportOneDraft`: excludes the permanent Report 1
 * exclusion list, classifies every remaining person into exactly one of
 * the four fixed sections (or drops them if they belong to none), and
 * resolves each סדיר/מילואים person's status via
 * `resolveRegularOrReserveStatus`. אנשי קבע always get "?" (V1 has no
 * authoritative permanent-staff attendance source -- see this repo's own
 * Report 1 spec). Preserves `people`'s own existing order within each
 * section -- never sorts alphabetically, never reorders by status.
 */
export function buildReportOneDraft(input: BuildReportOneDraftInput): ReportOneDraft {
  const { people, events, targetDate, prevDate } = input;

  const eventsByPersonToday = new Map<string, Event[]>();
  const eventsByPersonPrevDay = new Map<string, Event[]>();
  for (const event of events) {
    if (event.date === targetDate) {
      pushInto(eventsByPersonToday, event.personId, event);
    } else if (event.date === prevDate) {
      pushInto(eventsByPersonPrevDay, event.personId, event);
    }
  }

  const bySection = new Map<ReportOneSection, ReportOnePerson[]>(
    REPORT_ONE_SECTION_ORDER.map((section) => [section, []]),
  );

  for (const person of people) {
    if (isExcludedFromReportOne(person)) continue;

    const section = classifyReportOneSection(person);
    if (section === null) continue;

    const generatedStatus =
      section === "permanent"
        ? UNKNOWN_REPORT_ONE_STATUS
        : resolveRegularOrReserveStatus(
            eventsByPersonToday.get(person.id) ?? [],
            eventsByPersonPrevDay.get(person.id) ?? [],
          );

    bySection.get(section)!.push({ personId: person.id, name: person.name, section, generatedStatus });
  }

  const sections: ReportOneSectionGroup[] = REPORT_ONE_SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABELS[section],
    people: bySection.get(section)!,
  }));

  return { targetDate, sections };
}

function pushInto<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}
