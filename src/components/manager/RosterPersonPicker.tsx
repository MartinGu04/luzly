"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { unresolvedReasonLabel } from "@/lib/presentation/managerBroadcast";
import { groupRosterHierarchy } from "@/lib/presentation/roster";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

interface RosterPersonPickerProps {
  roster: ManagerPersonSummary[];
  /** Empty when the readiness lookup itself is unavailable -- the picker still works, it just can't annotate anyone's readiness. */
  adoptionPeople: ManagerAdoptionPersonView[];
  query: string;
  onQueryChange: (query: string) => void;
  selectedIds: readonly string[];
  onTogglePerson: (personId: string) => void;
}

function PersonCheckbox({
  person,
  checked,
  onToggle,
  adoption,
}: {
  person: ManagerPersonSummary;
  checked: boolean;
  onToggle: () => void;
  adoption: ManagerAdoptionPersonView | undefined;
}) {
  const reason = adoption ? unresolvedReasonLabel(adoption) : null;

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-overlay-soft">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
      />
      <span className="min-w-0 flex-1 truncate text-foreground">{person.name}</span>
      {adoption?.notificationStatus === "ready" ? (
        <Badge tone="success" className="shrink-0">
          Push
        </Badge>
      ) : adoption?.notificationStatus === "not_enabled" ? (
        <Badge tone="neutral" className="shrink-0">
          התראה בלבד
        </Badge>
      ) : reason ? (
        <Badge tone="warning" className="shrink-0">
          {reason}
        </Badge>
      ) : null}
    </label>
  );
}

/**
 * The roster search + checkbox picker every audience-selecting composer in
 * the Manager notification area needs -- extracted from
 * `ManagerBroadcastComposer` (the ONLY place this UI existed before) so the
 * Fixed Notifications Center's custom-recurring-rule composer reuses it
 * verbatim rather than a second roster-selection implementation (spec:
 * "reuse current roster/person selector UI patterns... do not duplicate a
 * second giant roster-selection implementation"). Purely presentational --
 * every real validation (roster membership, cardinality) happens
 * server-side in the action each composer calls; this component only ever
 * narrows what the manager can CLICK, never what the server trusts.
 */
export function RosterPersonPicker({ roster, adoptionPeople, query, onQueryChange, selectedIds, onTogglePerson }: RosterPersonPickerProps) {
  const adoptionByPersonId = useMemo(
    () => new Map(adoptionPeople.map((person) => [person.personId, person])),
    [adoptionPeople],
  );
  const groups = useMemo(() => groupRosterHierarchy(roster), [roster]);
  const normalizedQuery = query.trim().toLowerCase();

  return (
    <div className="rounded-xl bg-overlay-faint p-2 ring-1 ring-border">
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="חיפוש לפי שם"
        aria-label="חיפוש איש/אשת צוות"
        className="mb-1.5 w-full rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-2 focus:outline-none"
      />
      <ul className="max-h-56 overflow-y-auto">
        {groups.map((group) => {
          const rows = group.subgroups.length > 0 ? group.subgroups.flatMap((subgroup) => subgroup.people) : group.people;
          const matching = rows.filter((person) => normalizedQuery === "" || person.name.toLowerCase().includes(normalizedQuery));
          if (matching.length === 0) return null;
          return (
            <li key={group.group}>
              <div className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted-2 first:pt-0">{group.label}</div>
              {matching.map((person) => (
                <PersonCheckbox
                  key={person.id}
                  person={person}
                  checked={selectedIds.includes(person.id)}
                  onToggle={() => onTogglePerson(person.id)}
                  adoption={adoptionByPersonId.get(person.id)}
                />
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
