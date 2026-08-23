"use client";

import { useEffect } from "react";

interface WeekOverviewAutoScrollProps {
  railId: string;
  todayDayId: string;
}

/**
 * The one client-side sliver of "השבוע הקרוב": positions today's card into
 * view inside the mobile snap-scroll rail on first paint, so the user
 * never lands on Sunday and has to manually swipe to find today. Never the
 * Dashboard itself, never a data fetch -- just a DOM read/scroll after
 * mount.
 *
 * Always an instant `"auto"` scroll, never `"smooth"` -- there is no
 * animated sweep across the other six days to respect
 * `prefers-reduced-motion` for in the first place. Skipped entirely once
 * the rail isn't actually scrollable (`scrollWidth <= clientWidth`, i.e.
 * the desktop 7-column grid, which has no horizontal overflow), so this
 * never nudges the page at wider widths.
 */
export function WeekOverviewAutoScroll({ railId, todayDayId }: WeekOverviewAutoScrollProps) {
  useEffect(() => {
    const rail = document.getElementById(railId);
    const target = document.getElementById(todayDayId);
    if (!rail || !target || rail.scrollWidth <= rail.clientWidth) return;
    target.scrollIntoView({ behavior: "auto", inline: "start", block: "nearest" });
  }, [railId, todayDayId]);

  return null;
}
