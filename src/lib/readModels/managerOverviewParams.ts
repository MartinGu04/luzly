import { parseManagerRangeParam, type ManagerRangeKey } from "@/lib/domain/dateRange";

/** Already-normalized manager overview request params, ready for the loader/builder. `personId`/`month` are still raw/unvalidated -- the builder validates `personId` against the roster and `month` via `resolveManagerDateRange`. */
export interface ManagerOverviewParams {
  /** Null means "everyone" -- either omitted, explicitly "all", or (structurally) any other raw string the builder will later fail to resolve against the roster. */
  personId: string | null;
  range: ManagerRangeKey;
  /** Raw "YYYY-MM", or null -- validated later. */
  month: string | null;
  problemsOnly: boolean;
}

type SearchParamValue = string | string[] | undefined;

function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Strict parsing of the `/manager` route's search params into typed,
 * defaulted values. Never throws on malformed input -- every field falls
 * back to a safe default (see `parseManagerRangeParam` for range,
 * `resolveManagerDateRange` for month). `person=all` and an omitted
 * `person` are equivalent ("everyone").
 */
export function parseManagerOverviewSearchParams(searchParams: {
  person?: SearchParamValue;
  range?: SearchParamValue;
  month?: SearchParamValue;
  problems?: SearchParamValue;
}): ManagerOverviewParams {
  const rawPerson = firstParam(searchParams.person);
  const personId = rawPerson && rawPerson !== "all" ? rawPerson : null;

  return {
    personId,
    range: parseManagerRangeParam(firstParam(searchParams.range)),
    month: firstParam(searchParams.month) ?? null,
    problemsOnly: firstParam(searchParams.problems) === "1",
  };
}
