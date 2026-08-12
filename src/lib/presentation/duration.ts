/**
 * "נשארו 42 דקות" / "נשארו 3 שעות ו־15 דקות" -- pure minute-count
 * formatting, no Date/UTC. `prefix` lets the same formatter serve both
 * "remaining" and "starts in" copy without duplicating the hour/minute
 * pluralization logic.
 */
export function formatMinutesHebrew(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;

  if (hours === 0) {
    return formatMinutesPart(remainderMinutes);
  }

  const hoursPart = formatHoursPart(hours);
  if (remainderMinutes === 0) return hoursPart;
  return `${hoursPart} ו־${formatMinutesPart(remainderMinutes)}`;
}

function formatHoursPart(hours: number): string {
  if (hours === 1) return "שעה";
  if (hours === 2) return "שעתיים";
  return `${hours} שעות`;
}

function formatMinutesPart(minutes: number): string {
  if (minutes === 1) return "דקה";
  if (minutes === 2) return "שתי דקות";
  return `${minutes} דקות`;
}

/** "נשארו <duration>" for a currently-running assignment. */
export function formatRemaining(totalMinutes: number): string {
  return `נשארו ${formatMinutesHebrew(totalMinutes)}`;
}

/** "מתחיל בעוד <duration>" for an upcoming assignment with a known live countdown. */
export function formatStartsIn(totalMinutes: number): string {
  return `מתחיל בעוד ${formatMinutesHebrew(totalMinutes)}`;
}
