import type { FairnessPeriodKey } from "@/lib/domain/fairnessPeriod";

export interface ManagerFairnessHrefParams {
  period: FairnessPeriodKey;
  personId: string | null;
}

/**
 * Builds a `/manager/fairness` URL for the given state. `period` is always
 * explicit (unlike `/manager`'s range, the resolved default here depends on
 * the current date, not a fixed key -- omitting it could silently resolve
 * to a different period later, e.g. across the H1/H2 boundary while the
 * page stays open). Pure string building, no navigation/side effects.
 */
export function buildManagerFairnessHref(params: ManagerFairnessHrefParams): string {
  const search = new URLSearchParams();
  search.set("period", params.period);
  if (params.personId) search.set("person", params.personId);
  return `/manager/fairness?${search.toString()}`;
}
