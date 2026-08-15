import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { EmptyTeamState } from "@/components/with-me/EmptyTeamState";
import { ShiftContextCard } from "@/components/with-me/ShiftContextCard";
import type { ShiftContextView } from "@/components/with-me/types";
import { WithMeHeader } from "@/components/with-me/WithMeHeader";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import { assignmentEmoji } from "@/lib/presentation/emoji";
import { formatHebrewCalendarDate } from "@/lib/presentation/hebrewCalendar";
import { formatHebrewWeekdayAndDate, relativeDayLabel } from "@/lib/presentation/hebrewDate";
import { periodLabel, roleLabel } from "@/lib/presentation/labels";
import { formatMissingIntervals } from "@/lib/presentation/scheduleTime";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";
import type { PersonalShiftContext } from "@/lib/readModels/types";

function contextTitle(context: Pick<PersonalShiftContext, "role" | "period">): string {
  const parts = [roleLabel(context.role), periodLabel(context.period)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : "משמרת";
}

function contextDateLabel(date: string, todayDate: string): string {
  const relative = relativeDayLabel(date, todayDate);
  if (relative === "today") return "היום";
  if (relative === "tomorrow") return "מחר";
  return formatHebrewWeekdayAndDate(date) ?? date;
}

function emptyCounterpartMessage(status: CoverageStatus): string {
  if (status === "missing") return "לא נמצא כיסוי לתפקיד המשלים במשמרת הזו.";
  if (status === "not_evaluable") return "אין מספיק מידע כדי להעריך את הכיסוי במשמרת הזו.";
  return "אין מידע על אנשים נוספים במשמרת הזו.";
}

function buildShiftContextView(
  context: PersonalShiftContext,
  todayDate: string,
  keyPrefix: string,
  index: number,
  showHebrewCalendarDate: boolean,
): ShiftContextView {
  const hasCounterparts = context.primaryCounterparts.length > 0 || context.shadowCounterparts.length > 0;

  return {
    key: `${keyPrefix}-${context.date}-${context.role ?? "x"}-${context.period}-${index}`,
    emoji: assignmentEmoji({ category: "shift", period: context.period, dutyFamily: null, absenceKind: null }),
    title: contextTitle(context),
    dateLabel: contextDateLabel(context.date, todayDate),
    hebrewCalendarLabel: showHebrewCalendarDate ? formatHebrewCalendarDate(context.date) : null,
    coverageStatus: context.coverageStatus,
    missingIntervalLabels: formatMissingIntervals(context.missingIntervals),
    primaryCounterparts: context.primaryCounterparts,
    shadowCounterparts: context.shadowCounterparts,
    emptyCounterpartMessage: hasCounterparts ? null : emptyCounterpartMessage(context.coverageStatus),
  };
}

/**
 * "מי איתי" -- who's on the authenticated person's current shift, and who
 * will be on their next one. By the time this renders, the protected
 * `(app)` layout has already gated everything but "ok"/"configuration_error",
 * same convention as the dashboard, `/schedule`, and `/duties`. Calling
 * `getRequestPersonalSchedule()` again reuses the SAME request-scoped
 * result the layout already computed -- no second Google request, no new
 * read-model field: `currentShiftContexts`/`nextShiftContexts` already
 * carry everything this screen needs, and already exclude every colleague
 * field beyond `PersonalCounterpart`'s intentionally minimal shape.
 */
export default async function WithMePage() {
  const result = await getRequestPersonalSchedule();
  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const { model } = result;
  const todayDate = model.localNow.date;

  const hasCurrent = model.currentShiftContexts.length > 0;
  const hasNext = model.nextShiftContexts.length > 0;

  const currentViews = model.currentShiftContexts.map((context, index) =>
    buildShiftContextView(context, todayDate, "current", index, true),
  );
  const nextViews = model.nextShiftContexts.map((context, index) =>
    buildShiftContextView(context, todayDate, "next", index, !hasCurrent),
  );

  const currentSection = (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-muted">איתך עכשיו</h2>
      {currentViews.map((view) => (
        <ShiftContextCard key={view.key} view={view} emphasized />
      ))}
    </section>
  );

  const nextSection = (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-muted">המשמרת הבאה</h2>
      {nextViews.map((view) => (
        <ShiftContextCard key={view.key} view={view} emphasized={!hasCurrent} />
      ))}
    </section>
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <WithMeHeader />
      <DataFreshnessStatus fetchedAt={model.fetchedAt} />

      {hasCurrent && hasNext ? (
        // Both exist: an intentional side-by-side context layout on desktop
        // (current leads on the right in RTL, next beside it) rather than
        // two full-width stacked cards -- stacks normally on mobile.
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          {currentSection}
          {nextSection}
        </div>
      ) : hasCurrent ? (
        <div className="lg:max-w-xl">{currentSection}</div>
      ) : hasNext ? (
        <div className="lg:max-w-xl">{nextSection}</div>
      ) : (
        <EmptyTeamState />
      )}
    </div>
  );
}
