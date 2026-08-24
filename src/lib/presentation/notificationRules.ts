import { addCalendarDays, formatCalendarDate } from "@/lib/domain/dateRange";
import { dayOfWeek, parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { LocalNow } from "@/lib/domain/localNow";
import { formatClockTime } from "./scheduledBroadcast";
import { formatHebrewWeekdayAndDate, hebrewWeekdayName } from "./hebrewDate";

/**
 * Fixed / Recurring Notifications Center -- pure presentation only, no I/O.
 * Every system rule's Hebrew name/explanation/audience summary is a small
 * CURATED, hand-written description here -- never the raw `system_key`
 * shown as the primary label (spec: "Do not show internal category keys
 * as the primary UI"), and never derived from the rule's own (currently
 * locked, non-editable) title/body, since several system rules have no
 * static title/body at all (their copy is dynamically generated in
 * `reminders.ts` from resolved domain facts -- see that file's own
 * docstring). This table is intentionally the ONE place that curated
 * copy lives; the Manager UI never duplicates it.
 */
export interface SystemRuleDescription {
  name: string;
  trigger: string;
  audience: string;
  /** A short, truthful note on what's shown when the rule's own body is dynamically generated (never a fake fixed preview). */
  copyNote: string;
}

const SYSTEM_RULE_DESCRIPTIONS: Record<string, SystemRuleDescription> = {
  tomorrow_shift: {
    name: "תזכורת למשמרת מחר",
    trigger: "היום לפני משמרת -- מי שמשובץ למשמרת מחר",
    audience: "מי שמשובץ למשמרת למחר",
    copyNote: "הטקסט כולל את שעת ההתחלה בפועל של המשמרת, מחושב אוטומטית -- אינו ניתן לעריכה.",
  },
  tomorrow_duty: {
    name: "תזכורת לתורנות מחר",
    trigger: "היום לפני תורנות -- מי שמשובץ לתורנות מחר",
    audience: "מי שמשובץ לתורנות למחר",
    copyNote: "הטקסט כולל את סוג התורנות בפועל, מחושב אוטומטית -- אינו ניתן לעריכה.",
  },
  tomorrow_logistics_withdrawal: {
    name: "תזכורת למשיכות מחר",
    trigger: "היום לפני משיכות מהלוגיסטיקה -- מי שמשובץ למשיכות מחר",
    audience: "מי שמשובץ למשיכות מהלוגיסטיקה למחר",
    copyNote: "טקסט קבוע.",
  },
  tomorrow_logistics_withdrawal_supervisor: {
    name: "עדכון אחמ״ש -- משיכות מחר",
    trigger: "היום לפני משיכות מהלוגיסטיקה -- עדכון לאחמ״ש הרלוונטי",
    audience: "אחמ״ש רלוונטי למשמרת של מחר",
    copyNote: "הטקסט משתנה לפי שיוך טכנאי (עדכון) או העדר שיוך (אזהרה) -- מחושב אוטומטית.",
  },
  logistics_withdrawal_noon_assigned: {
    name: "תזכורת צהריים -- משיכות היום (משובץ)",
    trigger: "היום בצהריים, לפני חלון המשיכות -- למי שמשובץ",
    audience: "מי שמשובץ למשיכות היום",
    copyNote: "טקסט קבוע.",
  },
  logistics_withdrawal_noon_supervisor: {
    name: "תזכורת צהריים -- משיכות היום (אחמ״ש, אם לא שובץ טכנאי)",
    trigger: "היום בצהריים -- רק אם עדיין לא שובץ טכנאי למשיכות",
    audience: "אחמ״ש רלוונטי, רק אם לא שובץ טכנאי",
    copyNote: "טקסט קבוע.",
  },
  logistics_withdrawal_noon_team: {
    name: "תזכורת צהריים -- משיכות היום (צוות)",
    trigger: "היום בצהריים -- צוות הטכנאים הזמינים",
    audience: "טכנאים זמינים שאינם המשובץ/ת או האחמ״ש",
    copyNote: "הטקסט משתנה לפי שיוך טכנאי -- מחושב אוטומטית.",
  },
  almash_check_in: {
    name: "תזכורת עלמ״ש",
    trigger: "יום העלמ״ש עצמו -- שמירה / עתודה / אוקסיד בלבד",
    audience: "מי שיש לו עלמ״ש היום (שמירה/עתודה/אוקסיד)",
    copyNote: "בשבת נשלחת במוצ״ש האמיתי (זמן אסטרונומי) ולא בשעה הקבועה למטה -- אינו ניתן לשינוי.",
  },
  constraints_sunday: {
    name: "תזכורת לאילוצים -- יום ראשון",
    trigger: "כל יום ראשון",
    audience: "כל מי שאינו קבע (סדיר/מילואים בלבד)",
    copyNote: "טקסט קבוע.",
  },
  constraints_monday: {
    name: "תזכורת לאילוצים -- יום שני (אחרון)",
    trigger: "כל יום שני",
    audience: "כל מי שאינו קבע (סדיר/מילואים בלבד)",
    copyNote: "טקסט קבוע.",
  },
};

const FALLBACK_DESCRIPTION: SystemRuleDescription = {
  name: "כלל מערכת",
  trigger: "כלל קיים",
  audience: "מוגדר בקוד",
  copyNote: "",
};

export function describeSystemRule(systemKey: string): SystemRuleDescription {
  return SYSTEM_RULE_DESCRIPTIONS[systemKey] ?? FALLBACK_DESCRIPTION;
}

/** "כל יום שבת בשעה 21:00" -- a custom weekly rule's own schedule summary, pure (no I/O). `null` for an out-of-range weekday index. */
export function formatWeeklyRecurringSchedule(weekday: number, minuteOfDay: number): string | null {
  const name = hebrewWeekdayName(weekday);
  if (!name) return null;
  return `כל ${name} בשעה ${formatClockTime(minuteOfDay)}`;
}

/**
 * The next real Asia/Jerusalem local occurrence date, as a full
 * "יום שבת · 29 באוגוסט" moment string -- computed from the SAME
 * calendar-date arithmetic (`addCalendarDays`/`dayOfWeek`) the actual
 * dispatch check uses (`recurringRuleDispatch.ts`), never a second
 * calendar model. Prefers TODAY if it's already the rule's weekday and
 * the configured time hasn't passed yet; otherwise the next matching
 * weekday. Returns `null` only for a structurally invalid `now.date`.
 */
export function formatNextWeeklyOccurrence(weekday: number, minuteOfDay: number, now: LocalNow): string | null {
  const today = parseCalendarDate(now.date);
  if (!today) return null;

  const todayWeekday = dayOfWeek(today);
  const stillDueToday = todayWeekday === weekday && now.minuteOfDay < minuteOfDay;
  const offset = stillDueToday ? 0 : (weekday - todayWeekday + 7) % 7 || 7;
  const nextDate = formatCalendarDate(addCalendarDays(today, offset));

  const datePart = formatHebrewWeekdayAndDate(nextDate);
  if (!datePart) return null;
  return `${datePart} בשעה ${formatClockTime(minuteOfDay)}`;
}
