"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PersonPicker } from "@/components/people/PersonPicker";
import type { ScheduleRosterOption } from "@/lib/readModels/scheduleTypes";

export interface ScheduleManagerSelectorProps {
  managerName: string;
  people: ScheduleRosterOption[];
  perspective: "self" | "all" | "person";
  selectedPersonId: string | null;
}

const SELF_VALUE = "self";
const ALL_VALUE = "all";

/**
 * Manager-only Schedule perspective selector (PR #24 §5/§7) -- "מציג לוח
 * עבור: [ selection ▾ ]", built on the shared `PersonPicker` (grouped קבע /
 * סדיר (אחמ״שים / טכנאים) / מילואים, same as `ManagerPersonSelector`).
 *
 * Leading options, in the required order (PR #24 §6): "אני — <manager
 * name>" first, then "כולם", then the grouped roster (which the read model
 * already built with the manager's own entry excluded -- never shown
 * twice). Selecting only ever changes the `?person=` URL param -- every
 * other param (`month`) is preserved untouched -- and never touches the
 * authenticated identity/session (a viewing perspective, never
 * impersonation).
 */
export function ScheduleManagerSelector({
  managerName,
  people,
  perspective,
  selectedPersonId,
}: ScheduleManagerSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentValue = perspective === "all" ? ALL_VALUE : perspective === "person" && selectedPersonId ? selectedPersonId : SELF_VALUE;

  function navigateToPerson(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === SELF_VALUE) params.delete("person");
    else params.set("person", value);

    const query = params.toString();
    startTransition(() => {
      // `scroll: false` (PR #38 shell-unification round): switching
      // perspective is an IN-PLACE content change, same principle as
      // `MonthNav`'s `scroll={false}` -- the calendar shell stays anchored,
      // never resetting the viewport to the top. `router.push` scrolls to
      // the top of the page by default on every successful navigation,
      // same as a plain `<Link>` would, unless told not to.
      router.push(query ? `/schedule?${query}` : "/schedule", { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted">מציג לוח עבור</span>
      <PersonPicker
        people={people}
        leadingOptions={[
          { value: SELF_VALUE, label: `אני — ${managerName}` },
          { value: ALL_VALUE, label: "כולם" },
        ]}
        selectedValue={currentValue}
        onSelect={navigateToPerson}
        isPending={isPending}
        listboxId="schedule-manager-listbox"
        listAriaLabel="מציג לוח עבור"
        triggerAriaLabel={(label) => `מציג לוח עבור: ${label}`}
        triggerMaxWidthClassName="max-w-[12rem]"
      />
    </div>
  );
}
