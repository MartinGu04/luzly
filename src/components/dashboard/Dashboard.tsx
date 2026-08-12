import type { PersonalScheduleReadModel } from "@/lib/readModels/types";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { IssuesPanel } from "./IssuesPanel";
import { TodayTimeline } from "./TodayTimeline";
import { UpcomingSection } from "./UpcomingSection";

interface DashboardProps {
  model: PersonalScheduleReadModel;
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
  const isCurrentHero = model.currentAssignments.length > 0;

  // The exact assignments the Hero is already displaying -- Upcoming must
  // exclude only these specific Events, never every Event sharing their
  // date (see UpcomingSection for why a date-wide exclusion is wrong).
  const heroAssignments = isCurrentHero
    ? model.currentAssignments
    : (model.nextAssignmentGroup?.events ?? []);

  const todayDutyActions = model.dutyActions.filter((action) => action.date === model.localNow.date);

  return (
    <div className="flex flex-col gap-6">
      <Header personName={model.person.name} localNow={model.localNow} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6 lg:order-1">
          <Hero
            currentAssignments={model.currentAssignments}
            nextAssignmentGroup={model.nextAssignmentGroup}
            currentShiftContexts={model.currentShiftContexts}
            nextShiftContexts={model.nextShiftContexts}
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
