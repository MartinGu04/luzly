import type { HolidayContext } from "@/lib/presentation/hebrewCalendar";

/**
 * Presentation-safe per-day calendar metadata -- everything a calendar day
 * cell/detail panel needs that ISN'T a shift/duty/absence Event itself.
 * Computed server-side (weekday/Gregorian/Hebrew-calendar date labels,
 * holiday context) so the Hebrew-calendar library never has to ship to the
 * client bundle; only these already-formatted strings do.
 */
export interface DayMeta {
  date: string;
  dayNumber: number;
  isToday: boolean;
  isPast: boolean;
  /** "יום ראשון · 16 באוגוסט · ג׳ באלול תשפ״ו" */
  dateLabel: string;
  holiday: HolidayContext | null;
}
