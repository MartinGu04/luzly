"use client";

import { useMemo, useState } from "react";
import type { PersonalEventView } from "@/lib/readModels/types";
import { Panel } from "@/components/ui/Panel";
import { CalendarGrid } from "./CalendarGrid";
import { SelectedDayPanel } from "./SelectedDayPanel";
import type { DayMeta } from "./types";

interface ScheduleCalendarProps {
  grid: (string | null)[];
  days: Record<string, DayMeta>;
  /** The displayed month's own shift/duty/absence Events only -- never the full read model. */
  monthEvents: PersonalEventView[];
  defaultSelectedDate: string | null;
  /** Event dates (not necessarily today) of every currently-running personal shift -- see CalendarGrid. */
  activeShiftDates: string[];
}

/**
 * The only client boundary on "הלוח שלי" (`/schedule`): owns which day is
 * selected. Receives nothing beyond this month's already-safe shift/duty/
 * absence Events and presentation-safe calendar metadata (`DayMeta`) --
 * never the full `PersonalScheduleReadModel`, never counterpart/coworker
 * data.
 *
 * Desktop: a two-column layout -- the calendar leads (roughly 70% of the
 * width), the selected day's detail sits beside it in a ~380px side
 * column, never as a giant full-width card stacked below. Mobile keeps
 * the simpler stacked layout (detail below the calendar).
 *
 * Switching months is a normal server navigation (see `MonthNav`), but a
 * server-prop change alone does NOT guarantee this component's local
 * `selectedDate` state resets -- React only recreates state when the
 * component's *identity* changes. The page keys this component by the
 * month param (`key={monthParam}`) specifically so a month change forces a
 * fresh mount with a fresh `defaultSelectedDate`, rather than carrying the
 * previous month's selected day forward.
 */
export function ScheduleCalendar({
  grid,
  days,
  monthEvents,
  defaultSelectedDate,
  activeShiftDates,
}: ScheduleCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(defaultSelectedDate);

  const eventsByDate = useMemo(() => {
    const map: Record<string, PersonalEventView[]> = {};
    for (const event of monthEvents) {
      (map[event.date] ??= []).push(event);
    }
    return map;
  }, [monthEvents]);

  const selectedDayMeta = selectedDate ? (days[selectedDate] ?? null) : null;
  const selectedDayEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      <Panel variant="panel">
        <CalendarGrid
          grid={grid}
          days={days}
          eventsByDate={eventsByDate}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          activeShiftDates={activeShiftDates}
        />
      </Panel>
      <SelectedDayPanel dayMeta={selectedDayMeta} events={selectedDayEvents} />
    </div>
  );
}
