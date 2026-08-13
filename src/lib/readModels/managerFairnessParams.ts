export interface ManagerFairnessParams {
  /** Raw `?period=`, unvalidated -- resolved later against `LocalNow` (see `lib/domain/fairnessPeriod.ts`). */
  period: string | null;
  /** `null` means "everyone" -- either omitted, explicitly "all", or (structurally) any other raw string the builder will later fail to resolve against the period's rows. */
  personId: string | null;
}

type SearchParamValue = string | string[] | undefined;

function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Strict parsing of the `/manager/fairness` route's search params into
 * typed, unvalidated-but-safe values -- never throws on malformed input
 * (same convention as `managerOverviewParams.ts`). `person=all` and an
 * omitted `person` are equivalent ("everyone").
 */
export function parseManagerFairnessSearchParams(searchParams: {
  period?: SearchParamValue;
  person?: SearchParamValue;
}): ManagerFairnessParams {
  const rawPerson = firstParam(searchParams.person);
  return {
    period: firstParam(searchParams.period) ?? null,
    personId: rawPerson && rawPerson !== "all" ? rawPerson : null,
  };
}
