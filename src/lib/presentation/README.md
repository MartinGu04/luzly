# lib/presentation

Pure, framework-agnostic Hebrew presentation formatting -- safe to import
from both Server and Client Components. Nothing here touches the network,
auth, or scheduling *rules*; it only turns already-correct domain values
(a `LocalNow`, a calendar date string, an `IssueReason`, a role/period
enum) into display copy. Deliberately no `Date`/`Intl`-based calendar
arithmetic (that risk lives in `lib/time`, the one runtime boundary
allowed to touch `Date`) -- weekday/date formatting reuses the domain's
own pure calendar functions (`lib/domain/dutyBlocks.ts`'s
`parseCalendarDate`/`dayOfWeek`).

- `greeting.ts` — `greetingForMinuteOfDay` (בוקר טוב / צהריים טובים / ערב
  טוב / לילה טוב) and `firstNameOf`, for the dashboard header.
- `hebrewDate.ts` — weekday/date formatting (`formatHebrewWeekdayAndDate`,
  `formatShortWeekday`, `formatCompactDate`) and `relativeDayLabel`
  (today/tomorrow/other), all derived from the domain's calendar-date
  parsing rather than `Date`.
- `duration.ts` — `formatMinutesHebrew`/`formatRemaining`/`formatStartsIn`
  ("נשארו 42 דקות", "מתחיל בעוד 3 שעות ו־15 דקות"), with correct
  singular/dual/plural Hebrew forms.
- `labels.ts` — machine value → friendly Hebrew copy maps for
  `EventRole`/`EventPeriod`/`DutyFamily`/`IssueReason`/`IssueSeverity`/
  `CoverageStatus`. The UI must never render a raw machine value from
  these enums directly.
- `avatar.ts` — `initialsOf`, for the generated circular avatar.
- `eventColor.ts` — `eventColorKey`/`eventColorBgClassName`: a small, FIXED
  11-slot semantic color palette (shift day/night/morning, vacation,
  after, referral, medical/rest, evacuation on-call, guard, reserve,
  kitchen) for calendar events, keyed only off typed
  `category`/`period`/`dutyFamily`/`absenceKind` fields -- same input
  contract and precedence order as `emoji.ts`'s `assignmentEmoji`, but its
  own separately-reasoned mapping. Started as 8 slots; a follow-up pass
  added `shift-morning`, `medical-rest` (shared by `medical`+`day_off`),
  and `reserve` (shared by `reserve`+`callup`) for the remaining
  meaningful types that previously fell back to neutral. Deliberately
  still not every `DutyFamily`/`AbsenceKind`/`EventPeriod` value --
  `rasar`/`oxid` (duty) and shift `period: "unspecified"` stay unmapped,
  same graceful-degradation contract as the emoji map, since neither has
  an existing semantic color/emoji anywhere else in the codebase to reuse
  -- "a small, coherent palette", not a color per raw enum value.
  `eventColorBgClassName` returns a Tailwind soft-tint background class
  (the `--event-*-soft` tokens in `globals.css`, reusing this repo's
  dataviz categorical-color method) or `null`; used ONLY by
  `calendarDayIndicator.ts`'s personal "הלוח שלי" indicators (never
  `EveryoneMonthGrid`'s "כולם" grid, which stays on its own existing
  coverage-status coloring). `lib/calendar/icsColor.ts` reuses
  `eventColorKey` outright for the ICS feed's best-effort `COLOR`
  property -- one semantic mapping decision, two renderings.
- `dataFreshness.ts` — `formatDataFreshnessLabel(fetchedAt, now)` (PR
  #17): a deterministic relative-age label ("עודכן עכשיו" / "עודכן לפני 4
  דקות" / "עודכן לפני שעה") for a read model's `fetchedAt` -- explicitly
  takes `now` as a parameter rather than reading the clock itself, so
  it's testable without real `Date.now()`, and is only ever called
  client-side after mount (see `components/ui/DataFreshnessStatus.tsx`)
  to avoid a hydration mismatch. Fails safe (a generic fallback label,
  never a crash/`NaN`) on an unparseable timestamp; a negative elapsed
  duration (clock skew) reads as "just now", never a negative number.
