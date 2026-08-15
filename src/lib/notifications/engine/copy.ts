import { dutyFamilyLabel, periodLabel, roleLabel } from "@/lib/presentation/labels";
import { formatHebrewWeekday } from "@/lib/presentation/hebrewDate";
import type { FactChange } from "./diffFacts";
import type { CoverageFactValue, DutyFactValue, ShiftFactValue, TeamFactValue } from "./semanticFacts";

export interface NotificationCopy {
  title: string;
  body: string;
  path: string;
  tag: string;
}

/** `null` means: no meaningful notification for this change (e.g. a coverage fact that didn't transition INTO a gap). */
export function buildSettledChangeCopy(
  change: FactChange,
  personNameById: ReadonlyMap<string, string>,
): NotificationCopy | null {
  switch (change.category) {
    case "shift":
      return buildShiftChangeCopy(change);
    case "team":
      return buildTeamChangeCopy(change, personNameById);
    case "duty":
      return buildDutyChangeCopy(change);
    case "coverage":
      return buildCoverageGapCopy(change);
    default:
      return null;
  }
}

/**
 * `formatHebrewWeekday` already returns the full "יום שלישי" form (with
 * "יום" built in) -- callers must attach the `ב`/`ל` prefix DIRECTLY to
 * this value (`` `ב${onWeekday(date)}` ``, never `` `ביום ${...}` ``,
 * which would double up as "ביום יום שלישי").
 */
function onWeekday(date: string): string {
  return formatHebrewWeekday(date) ?? date;
}

function parseFactKey(factKey: string): string[] {
  return factKey.split(":");
}

// ---------------------------------------------------------------------------
// A -- shift change
// ---------------------------------------------------------------------------

function buildShiftChangeCopy(change: FactChange): NotificationCopy | null {
  const [, personId, date] = parseFactKey(change.factKey);
  const oldValue = change.oldValue as ShiftFactValue | null;
  const newValue = change.newValue as ShiftFactValue | null;
  const weekday = onWeekday(date);

  const oldEntries = oldValue?.entries ?? [];
  const newEntries = newValue?.entries ?? [];

  let body: string;
  if (oldEntries.length === 0 && newEntries.length === 1) {
    const label = periodLabel(newEntries[0].period);
    body = label ? `שובצת למשמרת ${label} ב${weekday}` : `שובצת למשמרת ב${weekday}`;
  } else if (oldEntries.length === 1 && newEntries.length === 0) {
    body = `השיבוץ שלך ל${weekday} בוטל`;
  } else if (oldEntries.length === 1 && newEntries.length === 1 && oldEntries[0].period !== newEntries[0].period) {
    const oldLabel = periodLabel(oldEntries[0].period);
    const newLabel = periodLabel(newEntries[0].period);
    body =
      oldLabel && newLabel
        ? `השיבוץ שלך ל${weekday} השתנה: ${oldLabel} → ${newLabel}`
        : `השיבוץ שלך ל${weekday} השתנה`;
  } else {
    // Anything more complex (multiple simultaneous entries, role-only
    // change, etc.) never invents specifics it can't safely express --
    // PR #30 spec section 12: fall back to a concise truthful message.
    body = `השיבוץ שלך ל${weekday} השתנה`;
  }

  return {
    title: "⚠️ שינוי בשיבוץ",
    body,
    path: "/schedule",
    tag: `shift-change-${personId}-${date}`,
  };
}

// ---------------------------------------------------------------------------
// B -- team change
// ---------------------------------------------------------------------------

function buildTeamChangeCopy(
  change: FactChange,
  personNameById: ReadonlyMap<string, string>,
): NotificationCopy | null {
  const [, personId, date, period] = parseFactKey(change.factKey);
  const oldValue = change.oldValue as TeamFactValue | null;
  const newValue = change.newValue as TeamFactValue | null;
  const weekday = onWeekday(date);
  const periodText = periodLabel(period as ShiftFactValue["entries"][number]["period"]);

  const oldColleagues = new Set(oldValue?.colleagues ?? []);
  const newColleagues = new Set(newValue?.colleagues ?? []);
  const joined = [...newColleagues].filter((id) => !oldColleagues.has(id));
  const left = [...oldColleagues].filter((id) => !newColleagues.has(id));

  const shiftLabel = periodText ? `למשמרת ה${periodText}` : "למשמרת";

  let body: string;
  if (joined.length === 1 && left.length === 0) {
    const name = personNameById.get(joined[0]);
    body = name ? `${name} שובץ איתך ${shiftLabel} ב${weekday}` : `מישהו שובץ איתך ${shiftLabel} ב${weekday}`;
  } else if (left.length === 1 && joined.length === 0) {
    const name = personNameById.get(left[0]);
    body = name
      ? `${name} כבר לא משובץ איתך ${shiftLabel} ב${weekday}`
      : `מישהו כבר לא משובץ איתך ${shiftLabel} ב${weekday}`;
  } else {
    body = `הצוות שלך ${shiftLabel} ב${weekday} השתנה`;
  }

  return {
    title: "👥 שינוי בצוות",
    body,
    // "/with-me" was removed as a standalone route (nav/people-selector
    // consolidation pass) -- "מי איתי" now lives only in its existing
    // dashboard presentation, so the notification opens the dashboard.
    path: "/",
    tag: `team-change-${personId}-${date}-${period}`,
  };
}

// ---------------------------------------------------------------------------
// C -- duty change
// ---------------------------------------------------------------------------

function buildDutyChangeCopy(change: FactChange): NotificationCopy | null {
  const [, personId, date] = parseFactKey(change.factKey);
  const oldValue = change.oldValue as DutyFactValue | null;
  const newValue = change.newValue as DutyFactValue | null;
  const weekday = onWeekday(date);

  const oldEntries = oldValue?.entries ?? [];
  const newEntries = newValue?.entries ?? [];

  let body: string;
  if (oldEntries.length === 0 && newEntries.length === 1) {
    body = `נוספה לך תורנות ${dutyFamilyLabel(newEntries[0].dutyFamily)} ב${weekday}`;
  } else if (oldEntries.length === 1 && newEntries.length === 0) {
    body = `התורנות שלך ב${weekday} בוטלה`;
  } else {
    body = `התורנות שלך ב${weekday} השתנתה`;
  }

  return {
    title: "🔄 שינוי בתורנות",
    body,
    path: "/duties",
    tag: `duty-change-${personId}-${date}`,
  };
}

// ---------------------------------------------------------------------------
// D -- manager-only coverage gap
// ---------------------------------------------------------------------------

/**
 * Only a genuine "valid coverage -> gap" transition is meaningful (PR #30
 * spec section 15). The caller (`changeDetection.ts`) already restricts
 * which settled changes reach here to exactly that transition -- this
 * function only builds the copy, it doesn't re-decide whether to fire.
 */
function buildCoverageGapCopy(change: FactChange): NotificationCopy | null {
  const [, date, period] = parseFactKey(change.factKey);
  const newValue = change.newValue as CoverageFactValue | null;
  if (!newValue) return null;

  const weekday = onWeekday(date);
  const periodText = periodLabel(period as ShiftFactValue["entries"][number]["period"]) ?? period;

  const missingRoles = [
    newValue.missingSupervisor ? roleLabel("supervisor") : null,
    newValue.missingTechnician ? roleLabel("technician") : null,
  ].filter((role): role is string => role !== null);

  const rolesText = missingRoles.length > 0 ? missingRoles.join(" ו") : "כיסוי";

  return {
    title: "🚨 חוסר בכיסוי",
    body: `חסר ${rolesText} במשמרת ${periodText} ב${weekday}`,
    // "/conflicts" was removed as a standalone route (nav/people-selector
    // consolidation pass) -- coverage gaps now surface in the manager's
    // unified "דורש טיפול" section, so the notification opens /manager.
    path: "/manager",
    tag: `coverage-gap-${date}-${period}`,
  };
}
