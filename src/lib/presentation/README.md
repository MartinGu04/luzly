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
