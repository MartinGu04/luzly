/**
 * Pure Hebrew daypart greeting from a `LocalNow.minuteOfDay` (0..1439) --
 * never a browser `Date`, so the greeting always matches the server's
 * already-correct Asia/Jerusalem reading rather than the visitor's own
 * device clock/timezone.
 */
export function greetingForMinuteOfDay(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  if (hour >= 5 && hour < 12) return "בוקר טוב";
  if (hour >= 12 && hour < 17) return "צהריים טובים";
  if (hour >= 17 && hour < 21) return "ערב טוב";
  return "לילה טוב";
}

/**
 * The first "word" of a (possibly multi-word, possibly untrimmed) Hebrew
 * name, for a compact personal greeting. Never throws on an empty/blank
 * name -- callers decide whether to render a name-less greeting instead.
 */
export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed === "") return "";
  return trimmed.split(/\s+/)[0];
}
