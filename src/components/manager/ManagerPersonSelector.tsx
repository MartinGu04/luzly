"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** The only shape this client component ever receives -- never the full manager read model, never raw personnel rows. */
export interface ManagerPersonOption {
  id: string;
  name: string;
}

interface ManagerPersonSelectorProps {
  people: ManagerPersonOption[];
  selectedId: string | null;
}

/**
 * The one narrow Client Component this screen needs (see PR #14 §19/§36):
 * a searchable-enough person picker. Selecting a person only ever changes
 * the `?person=` URL param -- every other param (range/month/problems) is
 * preserved untouched, and the authenticated identity/session never
 * changes (this is a manager inspection scope, not impersonation).
 */
export function ManagerPersonSelector({ people, selectedId }: ManagerPersonSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    const value = event.target.value;

    if (value === "all") {
      params.delete("person");
    } else {
      params.set("person", value);
    }

    const query = params.toString();
    router.push(query ? `/manager?${query}` : "/manager");
  }

  return (
    <select
      aria-label="בחירת איש/אשת צוות"
      value={selectedId ?? "all"}
      onChange={handleChange}
      className="rounded-full bg-overlay-soft px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <option value="all">כולם</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </select>
  );
}
