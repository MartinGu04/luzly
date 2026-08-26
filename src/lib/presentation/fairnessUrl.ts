import { formatMonthParam, type CalendarMonthKey } from "@/lib/domain/calendarMonth";
import type { FairnessPeriodKey } from "@/lib/domain/fairnessPeriod";

export type FairnessMode = "shifts" | "duties" | "emergency";

/** Strict parse of `?mode=` -- anything else (including missing) falls back to `"shifts"`, the default mode, never a guess or a crash. */
export function parseFairnessMode(raw: string | null | undefined): FairnessMode {
  if (raw === "duties") return "duties";
  if (raw === "emergency") return "emergency";
  return "shifts";
}

/**
 * Builds a `/fairness` URL for the Emergency shift-fairness mode (spec
 * section 16/17) -- `mode=emergency` is always explicit, same reasoning
 * as Duty mode: it is never the resolved default, so a link into it
 * must always say so. No month/period concept applies here (the model
 * reflects the emergency workbook's full recorded history, not one
 * calendar period), so this URL never carries either.
 */
export function fairnessEmergencyHref(): string {
  return "/fairness?mode=emergency";
}

interface FairnessShiftsHrefParams {
  monthKey?: CalendarMonthKey | null;
  personId?: string | null;
}

/**
 * Builds a `/fairness` URL for Shift mode. `mode=shifts` itself is
 * OMITTED -- it's the default, so a bare `/fairness` (no query at all) is
 * the canonical Shift-mode entry point, same "omit the default" idiom
 * `/schedule`'s own `scheduleHref` uses for its self perspective.
 * `monthKey: null`/omitted also omits `month`, resolving through the
 * page's own current-Jerusalem-month fallback -- what a "today" link
 * needs so it never pins a stale month into the URL.
 */
export function fairnessShiftsHref(params: FairnessShiftsHrefParams = {}): string {
  const search = new URLSearchParams();
  if (params.monthKey) search.set("month", formatMonthParam(params.monthKey));
  if (params.personId) search.set("person", params.personId);

  const query = search.toString();
  return query ? `/fairness?${query}` : "/fairness";
}

interface FairnessDutiesHrefParams {
  period?: FairnessPeriodKey | null;
  personId?: string | null;
}

/**
 * Builds a `/fairness` URL for Duty mode. `mode=duties` is ALWAYS explicit
 * (never omitted, unlike Shift's default) -- Duty is never the resolved
 * default, so a link into it must always say so. `period` is likewise
 * always explicit once known, same reasoning `ManagerFairnessPeriodSelector`
 * already documents: the resolved default period depends on the current
 * date, so omitting it could silently resolve to a different period later
 * while a link stays open.
 */
export function fairnessDutiesHref(params: FairnessDutiesHrefParams = {}): string {
  const search = new URLSearchParams();
  search.set("mode", "duties");
  if (params.period) search.set("period", params.period);
  if (params.personId) search.set("person", params.personId);
  return `/fairness?${search.toString()}`;
}
