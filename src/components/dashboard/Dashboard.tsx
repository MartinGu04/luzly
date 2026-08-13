import { BLOCKING_ABSENCE_KINDS } from "@/lib/domain/operationalIssues";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import type { PersonalEventView, PersonalScheduleReadModel } from "@/lib/readModels/types";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { IssuesPanel } from "./IssuesPanel";
import { TodayTimeline } from "./TodayTimeline";
import { UpcomingSection } from "./UpcomingSection";

interface DashboardProps {
  model: PersonalScheduleReadModel;
}

/** A known blocking absence (vacation/abroad/medical/day_off) dated today, reusing the domain's own "blocking" semantics -- never redefined here. */
function findVacationEvent(todayEvents: readonly PersonalEventView[]): PersonalEventView | null {
  return (
    todayEvents.find(
      (event) => event.category === "absence" && event.absenceKind !== null && BLOCKING_ABSENCE_KINDS.has(event.absenceKind),
    ) ?? null
  );
}

/**
 * Server-rendered composition of the whole dashboard. All data comes from
 * the already-safe `PersonalScheduleReadModel` -- no raw Events/People,
 * nothing re-derived from spreadsheet text here.
 *
 * Layout: a main narrative column (header, hero, today) plus a secondary
 * contextual column (issues, upcoming) on desktop; a single stacked column
 * on mobile, hero-first.
 */
export function Dashboard({ model }: DashboardProps) {
  const hasCurrentAssignment = model.currentAssignments.length > 0;

  // Vacation only becomes the hero's story when nothing is currently
  // active -- a blocking absence alongside a live assignment is exactly
  // the blocking_absence_with_assignment conflict, already surfaced via
  // Issues; the current assignment still leads the hero.
  const vacationEvent = hasCurrentAssignment ? null : findVacationEvent(model.todayEvents);
  const otherTodayEvents = vacationEvent ? model.todayEvents.filter((event) => event !== vacationEvent) : [];

  const showsNextGroup = !hasCurrentAssignment && !vacationEvent && model.nextAssignmentGroup !== null;

  // The exact assignments the Hero is already displaying -- Upcoming must
  // exclude only these specific Events, never every Event sharing their
  // date (see UpcomingSection for why a date-wide exclusion is wrong).
  // Nothing is "represented" when the hero shows the vacation/empty state.
  const heroAssignments = hasCurrentAssignment
    ? model.currentAssignments
    : showsNextGroup
      ? (model.nextAssignmentGroup?.events ?? [])
      : [];

  const todayDutyActions = model.dutyActions.filter((action) => action.date === model.localNow.date);

  return (
    <div className="flex flex-col gap-6">
      <Header personName={model.person.name} localNow={model.localNow} />
      <DataFreshnessStatus fetchedAt={model.fetchedAt} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6 lg:order-1">
          <Hero
            currentAssignments={model.currentAssignments}
            nextAssignmentGroup={model.nextAssignmentGroup}
            currentShiftContexts={model.currentShiftContexts}
            nextShiftContexts={model.nextShiftContexts}
            vacationEvent={vacationEvent}
            otherTodayEvents={otherTodayEvents}
            fetchedAt={model.fetchedAt}
            localNowDate={model.localNow.date}
          />

          <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <TodayTimeline
              todayEvents={model.todayEvents}
              todayDutyActions={todayDutyActions}
              localNow={model.localNow}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:order-2">
          <div className="animate-fade-up" style={{ animationDelay: "140ms" }}>
            <IssuesPanel issues={model.issues} />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
            <UpcomingSection
              upcomingEvents={model.upcomingEvents}
              dutyBlocks={model.dutyBlocks}
              localNowDate={model.localNow.date}
              representedAssignments={heroAssignments}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
