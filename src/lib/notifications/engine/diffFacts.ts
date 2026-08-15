import type { SemanticFact, SemanticFactCategory, SemanticFactValue } from "./semanticFacts";

export interface FactChange {
  factKey: string;
  category: SemanticFactCategory;
  oldValue: SemanticFactValue | null;
  newValue: SemanticFactValue | null;
}

/**
 * Pure structural diff between the last SETTLED facts (`oldFacts`) and a
 * fresh read (`newFacts`) -- a change only exists here when the
 * normalized VALUE actually differs, never because of cell formatting,
 * row order, or an unrelated column moving (those never reach this
 * layer at all, since `semanticFacts.ts` already normalized past them).
 * This is "semantic diffing, not raw cell diffing" (PR #30 spec section
 * 10) made concrete.
 */
export function diffSemanticFacts(
  oldFacts: ReadonlyMap<string, SemanticFact>,
  newFacts: ReadonlyMap<string, SemanticFact>,
): FactChange[] {
  const changes: FactChange[] = [];
  const allKeys = new Set([...oldFacts.keys(), ...newFacts.keys()]);

  for (const key of allKeys) {
    const oldFact = oldFacts.get(key);
    const newFact = newFacts.get(key);
    const oldValue = oldFact?.value ?? null;
    const newValue = newFact?.value ?? null;

    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

    changes.push({
      factKey: key,
      category: (newFact ?? oldFact)!.category,
      oldValue,
      newValue,
    });
  }

  return changes;
}
