import type { DutyFamily } from "./event";

/**
 * One fairness-row exemption, with typed known applicability where
 * deterministic (PR #15 §16/§17). `raw` is always preserved verbatim, even
 * for an unknown label -- exemptions are never discarded, and an unknown
 * label never gets an invented duty-family mapping.
 */
export interface FairnessExemption {
  raw: string;
  /** Empty for an unknown/unmapped exemption label -- never guessed. */
  affectedDutyFamilies: readonly DutyFamily[];
}

/**
 * Centralized, exact-match-only known exemption -> affected duty family
 * mapping (PR #15 §17). No fuzzy matching either direction -- a label not
 * listed here is preserved as raw text with an empty `affectedDutyFamilies`.
 */
const KNOWN_EXEMPTION_DUTY_FAMILIES: Readonly<Record<string, readonly DutyFamily[]>> = {
  שמירות: ["guard"],
  מטבח: ["daily_kitchen", "full_kitchen", "weekend_kitchen"],
  'רס"ר': ["rasar"],
};

export function resolveFairnessExemption(raw: string): FairnessExemption {
  return { raw, affectedDutyFamilies: KNOWN_EXEMPTION_DUTY_FAMILIES[raw] ?? [] };
}

/** Order-preserving projection of raw exemption labels to their typed applicability. */
export function resolveFairnessExemptions(rawLabels: readonly string[]): FairnessExemption[] {
  return rawLabels.map(resolveFairnessExemption);
}
