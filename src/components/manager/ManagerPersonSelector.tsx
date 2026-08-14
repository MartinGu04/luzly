"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

/** The only shape this client component ever receives -- never the full manager read model, never raw personnel rows. */
export interface ManagerPersonOption {
  id: string;
  name: string;
}

interface ManagerPersonSelectorProps {
  people: ManagerPersonOption[];
  selectedId: string | null;
}

const ALL_VALUE = "all";

interface Option {
  value: string;
  label: string;
}

const LISTBOX_ID = "manager-person-listbox";

/**
 * The one narrow Client Component this screen needs (see PR #14 §19/§36):
 * a searchable-enough person picker. A custom accessible listbox rather
 * than a native `<select>` -- native `<option>` popups are rendered by the
 * browser/OS chrome and cannot be reliably restyled for dark mode (Design
 * Pass PR #21 §5), so every pixel here is our own theme-aware surface
 * (`bg-surface-2`/`text-foreground`/etc, same tokens as the rest of the
 * app) instead. Full keyboard support: ArrowUp/ArrowDown/Home/End move the
 * highlight, Enter/Space selects, Escape closes and returns focus to the
 * trigger button, a pointer click outside closes it too, and Tab/Shift+Tab
 * away from the open listbox closes it rather than leaving it visually
 * open with no keyboard path back into it (see `handleListBlur`). The
 * trigger button's own accessible name is contextual -- "בחירת איש/אשת
 * צוות: <current selection>" -- rather than relying on its bare visible
 * text ("כולם"/a person's name), which alone wouldn't tell an AT user what
 * the control does.
 *
 * Selecting a person only ever changes the `?person=` URL param -- every
 * other param (range/month/problems) is preserved untouched, and the
 * authenticated identity/session never changes (this is a manager
 * inspection scope, not impersonation).
 */
export function ManagerPersonSelector({ people, selectedId }: ManagerPersonSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);

  const options: Option[] = [
    { value: ALL_VALUE, label: "כולם" },
    ...people.map((person) => ({ value: person.id, label: person.name })),
  ];
  const selectedIndex = options.findIndex((option) => option.value === (selectedId ?? ALL_VALUE));
  const selectedOption = options[selectedIndex] ?? options[0];

  function navigateToPerson(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL_VALUE) params.delete("person");
    else params.set("person", value);

    const query = params.toString();
    router.push(query ? `/manager?${query}` : "/manager");
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

  /**
   * The listbox has `tabIndex={-1}` -- reachable via `.focus()` but never
   * part of the page's natural Tab sequence -- so pressing Tab moves focus
   * to whatever comes next in DOM order after it, and Shift+Tab moves
   * BACKWARD to the trigger button itself (the nearest preceding tabbable
   * element). Either way, focus leaves the listbox without going through
   * our own Escape/select handlers, so it must close itself here rather
   * than staying visually open with no keyboard path back into it (Design
   * Pass PR #21 follow-up). Unconditional: even the Shift+Tab-back-to-
   * trigger case should close it -- there's no reason to leave the menu
   * open once focus is back on its own trigger, and our own
   * `closeMenu(true)` calls (Escape/select) already set `open` to `false`
   * before triggering this same blur, so it's a harmless no-op then.
   */
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
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={LISTBOX_ID}
        aria-label={`בחירת איש/אשת צוות: ${selectedOption.label}`}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleButtonKeyDown}
        className="flex items-center gap-1.5 rounded-full bg-overlay-soft px-3.5 py-1.5 text-sm font-medium text-foreground ring-1 ring-border transition-colors duration-200 hover:bg-overlay-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="max-w-[9rem] truncate">{selectedOption.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" strokeWidth={2} />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
          aria-label="בחירת איש/אשת צוות"
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
  );
}
