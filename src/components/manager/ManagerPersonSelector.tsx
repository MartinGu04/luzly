"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PersonPicker, type PersonPickerPerson } from "@/components/people/PersonPicker";

/** The only shape this client component ever receives -- never the full manager read model, never raw personnel rows/email. */
export type ManagerPersonOption = PersonPickerPerson;

interface ManagerPersonSelectorProps {
  people: ManagerPersonOption[];
  selectedId: string | null;
}

const ALL_VALUE = "all";

/**
 * The one narrow Client Component this screen needs: a person picker,
 * grouped קבע / סדיר (אחמ״שים / טכנאים) / מילואים via the shared
 * `PersonPicker` (see `@/components/people/PersonPicker` for the
 * interaction/accessibility contract). Selecting a person only ever
 * changes the `?person=` URL param -- every other param (range/month/
 * problems) is preserved untouched, and the authenticated identity/session
 * never changes (this is a manager inspection scope, not impersonation).
 */
export function ManagerPersonSelector({ people, selectedId }: ManagerPersonSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function navigateToPerson(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL_VALUE) params.delete("person");
    else params.set("person", value);

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/manager?${query}` : "/manager");
    });
  }

  return (
    <PersonPicker
      people={people}
      leadingOptions={[{ value: ALL_VALUE, label: "כולם" }]}
      selectedValue={selectedId ?? ALL_VALUE}
      onSelect={navigateToPerson}
      isPending={isPending}
      listboxId="manager-person-listbox"
      listAriaLabel="בחירת איש/אשת צוות"
      triggerAriaLabel={(label) => `בחירת איש/אשת צוות: ${label}`}
    />
  );
}
