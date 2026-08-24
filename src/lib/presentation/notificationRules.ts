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
 *
 * ALSO the ONE authoritative catalog for the editable-copy/audience-
 * filtering follow-up: `bodyKind` classifies whether a category's body
 * ever contains runtime domain facts (`dynamic_details_required` -- the
 * manager's own body override, if any, MUST be a `{details}` template,
 * enforced server-side in `ruleActions.ts`) or never does
 * (`static_editable` -- a manager's override may fully replace the body).
 * `defaultTitle`/`defaultBody` are the exact built-in copy used whenever
 * no override is saved -- shown in the Manager UI as placeholders/
 * "current default" text, never re-derived or duplicated elsewhere.
 * `audienceFilterNote` is the one truthful, category-specific sentence
 * explaining that audience selection FILTERS the real domain-eligible
 * set and can never expand it (spec: "be explicit that this is a
 * restriction, not an override"). This classification is consulted by
 * `engine/systemRuleCopy.ts` (applying an override at send time),
 * `ruleActions.ts` (validating a save), and the Manager UI (deciding
 * which controls/help text to show) -- nowhere else re-derives it.
 */
export type SystemRuleBodyKind = "static_editable" | "dynamic_details_required";

export interface SystemRuleDescription {
  name: string;
  trigger: string;
  audience: string;
  /** A short, truthful note on what's shown when the rule's own body is dynamically generated (never a fake fixed preview). */
  copyNote: string;
  bodyKind: SystemRuleBodyKind;
  /** The built-in title used whenever no manager override is saved. For a category whose real title varies by domain branch (e.g. assigned vs. unassigned), this is the representative/primary variant -- an override always replaces whichever branch would have applied, never just one of them. */
  defaultTitle: string;
  /** The exact built-in body used whenever no override is saved -- only meaningful for `bodyKind: "static_editable"` (a dynamic category has no single fixed body to show; its "{details}" is generated fresh per occurrence). */
  defaultBody: string | null;
  /** Explains that the audience selector FILTERS the real domain-eligible recipients of this rule -- it can never expand who receives it. Shown next to the audience picker in the Manager UI. */
  audienceFilterNote: string;
}

const SYSTEM_RULE_DESCRIPTIONS: Record<string, SystemRuleDescription> = {
  tomorrow_shift: {
    name: "תזכורת למשמרת מחר",
    trigger: "היום לפני משמרת -- מי שמשובץ למשמרת מחר",
    audience: "מי שמשובץ למשמרת למחר",
    copyNote: "הטקסט כולל את שעת ההתחלה בפועל של המשמרת, מחושב אוטומטית.",
    bodyKind: "dynamic_details_required",
    defaultTitle: "⏰ המשמרת שלך מחר",
    defaultBody: null,
    audienceFilterNote: "ההתראה עדיין תישלח רק למי שיש לו משמרת מחר בפועל -- הבחירה כאן רק מצמצמת מתוכם, לא מוסיפה עליהם.",
  },
  tomorrow_duty: {
    name: "תזכורת לתורנות מחר",
    trigger: "היום לפני תורנות -- מי שמשובץ לתורנות מחר",
    audience: "מי שמשובץ לתורנות למחר",
    copyNote: "הטקסט כולל את סוג התורנות בפועל, מחושב אוטומטית.",
    bodyKind: "dynamic_details_required",
    defaultTitle: "🪖 תורנות מתקרבת",
    defaultBody: null,
    audienceFilterNote: "ההתראה עדיין תישלח רק למי שיש לו תורנות מחר בפועל -- הבחירה כאן רק מצמצמת מתוכם, לא מוסיפה עליהם.",
  },
  tomorrow_logistics_withdrawal: {
    name: "תזכורת למשיכות מחר",
    trigger: "היום לפני משיכות מהלוגיסטיקה -- מי שמשובץ למשיכות מחר",
    audience: "מי שמשובץ למשיכות מהלוגיסטיקה למחר",
    copyNote: "טקסט קבוע -- ניתן לעריכה מלאה.",
    bodyKind: "static_editable",
    defaultTitle: "📦 משיכות מהלוגיסטיקה מחר",
    defaultBody: "מחר אתה עושה משיכות בין 13:00–14:00.",
    audienceFilterNote: "ההתראה עדיין תישלח רק למי שמשובץ בפועל למשיכות מחר -- הבחירה כאן רק מצמצמת מתוכם, לא מוסיפה עליהם.",
  },
  tomorrow_logistics_withdrawal_supervisor: {
    name: "עדכון אחמ״ש -- משיכות מחר",
    trigger: "היום לפני משיכות מהלוגיסטיקה -- עדכון לאחמ״ש הרלוונטי",
    audience: "אחמ״ש רלוונטי למשמרת של מחר",
    copyNote: "הטקסט משתנה לפי שיוך טכנאי (עדכון) או העדר שיוך (אזהרה), מחושב אוטומטית.",
    bodyKind: "dynamic_details_required",
    defaultTitle: "📦 משיכות מחר",
    defaultBody: null,
    audienceFilterNote: "ההתראה עדיין תישלח רק לאחמ״ש רלוונטי בפועל -- הבחירה כאן רק מצמצמת מתוכם, לא מוסיפה עליהם.",
  },
  logistics_withdrawal_noon_assigned: {
    name: "תזכורת צהריים -- משיכות היום (משובץ)",
    trigger: "היום בצהריים, לפני חלון המשיכות -- למי שמשובץ",
    audience: "מי שמשובץ למשיכות היום",
    copyNote: "טקסט קבוע -- ניתן לעריכה מלאה.",
    bodyKind: "static_editable",
    defaultTitle: "📦 משיכות בעוד שעה",
    defaultBody: "היום אתה עושה משיכות בין 13:00–14:00.",
    audienceFilterNote: "ההתראה עדיין תישלח רק למי שמשובץ בפועל למשיכות היום -- הבחירה כאן רק מצמצמת מתוכם, לא מוסיפה עליהם.",
  },
  logistics_withdrawal_noon_supervisor: {
    name: "תזכורת צהריים -- משיכות היום (אחמ״ש, אם לא שובץ טכנאי)",
    trigger: "היום בצהריים -- רק אם עדיין לא שובץ טכנאי למשיכות",
    audience: "אחמ״ש רלוונטי, רק אם לא שובץ טכנאי",
    copyNote: "טקסט קבוע -- ניתן לעריכה מלאה.",
    bodyKind: "static_editable",
    defaultTitle: "⚠️ לא הוגדר טכנאי למשיכות",
    defaultBody: "לא הוגדר טכנאי למשיכות היום בין 13:00–14:00. נדרש לוודא שכל הטכנאים הזמינים יוצאים למשיכות.",
    audienceFilterNote: "ההתראה עדיין תישלח רק לאחמ״ש רלוונטי בפועל, ורק אם לא שובץ טכנאי -- הבחירה כאן רק מצמצמת מתוכם, לא מוסיפה עליהם.",
  },
  logistics_withdrawal_noon_team: {
    name: "תזכורת צהריים -- משיכות היום (צוות)",
    trigger: "היום בצהריים -- צוות הטכנאים הזמינים",
    audience: "טכנאים זמינים שאינם המשובץ/ת או האחמ״ש",
    copyNote: "הטקסט משתנה לפי שיוך טכנאי, מחושב אוטומטית.",
    bodyKind: "dynamic_details_required",
    defaultTitle: "🤝 משיכות היום",
    defaultBody: null,
    audienceFilterNote: "ההתראה עדיין תישלח רק לטכנאים זמינים רלוונטיים בפועל -- הבחירה כאן רק מצמצמת מתוכם, לא מוסיפה עליהם.",
  },
  almash_check_in: {
    name: "תזכורת עלמ״ש",
    trigger: "יום העלמ״ש עצמו -- שמירה / עתודה / אוקסיד בלבד",
    audience: "מי שיש לו עלמ״ש היום (שמירה/עתודה/אוקסיד)",
    copyNote: "בשבת נשלחת במוצ״ש האמיתי (זמן אסטרונומי) ולא בשעה הקבועה למטה -- אינו ניתן לשינוי. הטקסט כולל את סוג התורנות בפועל, מחושב אוטומטית.",
    bodyKind: "dynamic_details_required",
    defaultTitle: "🫡 עלמ״ש בעוד רבע שעה",
    defaultBody: null,
    audienceFilterNote: "ההתראה עדיין תישלח רק למי שיש לו עלמ״ש היום בפועל -- הבחירה כאן רק מצמצמת מתוכם, לא מוסיפה עליהם.",
  },
  constraints_sunday: {
    name: "תזכורת לאילוצים -- יום ראשון",
    trigger: "כל יום ראשון",
    audience: "כל מי שאינו קבע (סדיר/מילואים בלבד)",
    copyNote: "טקסט קבוע -- ניתן לעריכה מלאה.",
    bodyKind: "static_editable",
    defaultTitle: "📌 תזכורת לאילוצים",
    defaultBody: "יש אילוץ לשבוע הבא? אפשר לשלוח עד מחר.",
    audienceFilterNote: "קבע מוחרגים תמיד, גם אם נבחרו ברשימה -- הבחירה כאן רק מצמצמת מבין מי שאינו קבע, לעולם לא מוסיפה קבע.",
  },
  constraints_monday: {
    name: "תזכורת לאילוצים -- יום שני (אחרון)",
    trigger: "כל יום שני",
    audience: "כל מי שאינו קבע (סדיר/מילואים בלבד)",
    copyNote: "טקסט קבוע -- ניתן לעריכה מלאה.",
    bodyKind: "static_editable",
    defaultTitle: "⏳ היום האחרון לאילוצים",
    defaultBody: "אפשר לשלוח אילוצים לשבוע הבא עד סוף היום.",
    audienceFilterNote: "קבע מוחרגים תמיד, גם אם נבחרו ברשימה -- הבחירה כאן רק מצמצמת מבין מי שאינו קבע, לעולם לא מוסיפה קבע.",
  },
};

const FALLBACK_DESCRIPTION: SystemRuleDescription = {
  name: "כלל מערכת",
  trigger: "כלל קיים",
  audience: "מוגדר בקוד",
  copyNote: "",
  bodyKind: "static_editable",
  defaultTitle: "",
  defaultBody: "",
  audienceFilterNote: "הבחירה כאן רק מצמצמת מבין מי שרלוונטי בפועל, לעולם לא מוסיפה עליהם.",
};

export function describeSystemRule(systemKey: string): SystemRuleDescription {
  return SYSTEM_RULE_DESCRIPTIONS[systemKey] ?? FALLBACK_DESCRIPTION;
}

/** The one required placeholder a dynamic-body system rule's body override/template must contain -- see `SystemRuleDescription.bodyKind`. */
export const SYSTEM_RULE_DETAILS_PLACEHOLDER = "{details}";

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
