import "server-only";
import { fetchRawWorkbookSnapshot } from "@/lib/google";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import type { Person } from "@/lib/domain/types";
import { getAuthenticatedIdentity } from "./currentUser";

export type ResolveCurrentPersonResult =
  | { status: "unauthenticated" }
  | { status: "unmapped"; email: string }
  | { status: "ok"; person: Person };

/**
 * Matches an authenticated email against parsed כ"א personnel by email
 * only — never by display-name similarity. Comparison is trimmed and
 * case-insensitive (and nothing further: email equality, not fuzzy
 * matching). Pure and independently testable with synthetic Person[].
 */
export function findPersonByEmail(people: readonly Person[], email: string): Person | null {
  const normalized = normalizeEmailForComparison(email);
  return people.find((person) => person.email !== null && normalizeEmailForComparison(person.email) === normalized) ?? null;
}

function normalizeEmailForComparison(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Maps the authenticated Supabase user to a parsed כ"א `Person`:
 *
 * 1. requires an authenticated Supabase user (never trusts a
 *    client-supplied email)
 * 2. fetches the workbook snapshot server-side (reuses the existing
 *    read-only Google layer — no duplicate API access)
 * 3. parses the personnel sheet (reuses the existing parser — no
 *    duplicate personnel parsing)
 * 4. finds the matching Person by email
 *
 * A valid Google/Supabase login does NOT by itself grant Luzly access —
 * an authenticated email absent from כ"א resolves to "unmapped", not a
 * Person. Manager status is whatever `Person.isManager` says; this
 * function invents no separate allowlist.
 */
export async function resolveCurrentPerson(): Promise<ResolveCurrentPersonResult> {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return { status: "unauthenticated" };

  const snapshot = await fetchRawWorkbookSnapshot(["personnel"]);
  const personnelSheet = snapshot.sheets[0];
  const people = parsePersonnelSheet(personnelSheet);

  const person = findPersonByEmail(people, identity.email);
  if (!person) return { status: "unmapped", email: identity.email };

  return { status: "ok", person };
}
