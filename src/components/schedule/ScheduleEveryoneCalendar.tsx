"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import type { ScheduleEveryoneDayView } from "@/lib/presentation/scheduleEveryone";
import { EveryoneMonthGrid } from "./EveryoneMonthGrid";
import { EveryoneSelectedDayPanel } from "./EveryoneSelectedDayPanel";
import type { DayMeta } from "./types";

interface ScheduleEveryoneCalendarProps {
  grid: (string | null)[];
  days: Record<string, DayMeta>;
  dayViews: Record<string, ScheduleEveryoneDayView>;
  defaultSelectedDate: string | null;
}

/**
 * "כולם" mode's client boundary -- owns which day is selected, same
 * pattern as `ScheduleCalendar`. Receives only the already-safe, already
 * month-scoped `ScheduleEveryoneDayView` projection -- never a full
 * `Person`/`Event`, never email (PR #24 §24). The page keys this by the
 * month param exactly like `ScheduleCalendar` does, so a month change
 * always mounts fresh with a fresh `defaultSelectedDate`.
 */
export function ScheduleEveryoneCalendar({ grid, days, dayViews, defaultSelectedDate }: ScheduleEveryoneCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(defaultSelectedDate);

  const selectedDayMeta = selectedDate ? (days[selectedDate] ?? null) : null;
  const selectedDayView = selectedDate ? (dayViews[selectedDate] ?? null) : null;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      <Panel variant="panel">
        <EveryoneMonthGrid
          grid={grid}
          days={days}
          dayViews={dayViews}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </Panel>
      <EveryoneSelectedDayPanel dayMeta={selectedDayMeta} dayView={selectedDayView} />
    </div>
  );
}
