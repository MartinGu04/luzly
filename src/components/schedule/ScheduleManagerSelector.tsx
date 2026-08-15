"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import type { ScheduleRosterOption } from "@/lib/readModels/scheduleTypes";

export interface ScheduleManagerSelectorProps {
  managerName: string;
  people: ScheduleRosterOption[];
  perspective: "self" | "all" | "person";
  selectedPersonId: string | null;
}

const SELF_VALUE = "self";
const ALL_VALUE = "all";

interface Option {
  value: string;
  label: string;
}

const LISTBOX_ID = "schedule-manager-listbox";

/**
 * Manager-only Schedule perspective selector (PR #24 §5/§7) -- "מציג לוח
 * עבור: [ selection ▾ ]". A Schedule-specific sibling of
 * `ManagerPersonSelector` rather than a reuse of it: that component's
 * navigation is hardwired to `/manager` and has no "אני"/self concept (its
 * own `person` param means "everyone" when absent, never "self") --
 * awkward assumptions to bend for this screen (PR #24 §7 explicitly allows
 * a Schedule-specific selector). The interaction/accessibility SHAPE is
 * deliberately the same: a custom styled listbox (native `<option>` popups
 * can't be reliably restyled for dark mode), full keyboard support
 * (ArrowUp/ArrowDown/Home/End/Enter/Space/Escape), outside-click-to-close,
 * a contextual trigger `aria-label`, and a selected-option check mark.
 *
 * Options, in the required order (PR #24 §6): "אני — <manager name>" first,
 * then "כולם", then the roster (which the read model already built with
 * the manager's own entry excluded -- never shown twice). Selecting only
 * ever changes the `?person=` URL param -- every other param (`month`) is
 * preserved untouched -- and never touches the authenticated identity/
 * session (a viewing perspective, never impersonation).
 */
export function ScheduleManagerSelector({
  managerName,
  people,
  perspective,
  selectedPersonId,
}: ScheduleManagerSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);

  const options: Option[] = [
    { value: SELF_VALUE, label: `אני — ${managerName}` },
    { value: ALL_VALUE, label: "כולם" },
    ...people.map((person) => ({ value: person.id, label: person.name })),
  ];

  const currentValue = perspective === "all" ? ALL_VALUE : perspective === "person" && selectedPersonId ? selectedPersonId : SELF_VALUE;
  const selectedIndex = options.findIndex((option) => option.value === currentValue);
  const selectedOption = options[selectedIndex] ?? options[0];

  function navigateToPerson(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === SELF_VALUE) params.delete("person");
    else params.set("person", value);

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/schedule?${query}` : "/schedule");
    });
  }

  function openMenu() {
    setHighlightedIndex(selectedIndex === -1 ? 0 : selectedIndex);
    setOpen(true);
  }

  function closeMenu(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function selectOption(index: number) {
    const option = options[index];
    closeMenu(true);
    if (option && option.value !== selectedOption.value) {
      navigateToPerson(option.value);
    }
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeMenu(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[highlightedIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [open, highlightedIndex]);

  function handleButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  }

  /** See `ManagerPersonSelector.handleListBlur` -- same deliberate unconditional-close rationale (Tab/Shift+Tab away from the listbox must never leave it visually open with no keyboard path back into it). */
  function handleListBlur() {
    setOpen(false);
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, options.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(highlightedIndex);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted">מציג לוח עבור</span>
      <div ref={containerRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-label={`מציג לוח עבור: ${selectedOption.label}`}
          aria-busy={isPending}
          disabled={isPending}
          onClick={() => (open ? closeMenu(false) : openMenu())}
          onKeyDown={handleButtonKeyDown}
          className="flex items-center gap-1.5 rounded-full bg-overlay-soft px-3.5 py-1.5 text-sm font-medium text-foreground ring-1 ring-border transition-colors duration-200 hover:bg-overlay-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="max-w-[12rem] truncate">{selectedOption.label}</span>
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" aria-hidden="true" strokeWidth={2} />
          ) : (
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" strokeWidth={2} />
          )}
        </button>

        {open ? (
          <ul
            ref={listRef}
            id={LISTBOX_ID}
            role="listbox"
            aria-label="מציג לוח עבור"
            aria-activedescendant={`${LISTBOX_ID}-option-${highlightedIndex}`}
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
            onBlur={handleListBlur}
            className="absolute z-20 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-2xl bg-surface-2 p-1.5 shadow-[var(--shadow-hero)] ring-1 ring-border-strong focus:outline-none"
          >
            {options.map((option, index) => {
              const isSelected = option.value === selectedOption.value;
              const isHighlighted = index === highlightedIndex;
              return (
                <li
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  id={`${LISTBOX_ID}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectOption(index)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors duration-150 ${
                    isHighlighted ? "bg-overlay-strong text-foreground" : "text-foreground"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" strokeWidth={2} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
