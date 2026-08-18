"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

const METRIC_EXPLANATIONS: readonly { term: string; meaning: string }[] = [
  { term: "משמרות שבוצעו", meaning: "מספר המשמרות שהאדם ביצע בפועל בתקופה שנבחרה." },
  {
    term: "יעד אישי",
    meaning:
      "מספר המשמרות שהמערכת מעריכה שהיה הוגן לצפות מאותו אדם לבצע בתקופה, בהתאם להזדמנויות ולזמינות שלו — לא חלוקה שווה אוטומטית בין כולם.",
  },
  { term: "פער מהיעד", meaning: "ההפרש בין מספר המשמרות שבוצעו בפועל לבין היעד האישי." },
  { term: 'משמרות סופ"ש שבוצעו', meaning: 'מספר משמרות הסופ"ש שבוצעו בפועל.' },
  { term: 'יעד סופ"ש', meaning: 'היעד המחושב למשמרות סופ"ש, שמחושב בנפרד לפי הזדמנויות הסופ"ש.' },
];

/**
 * ONE small, restrained info control per Shift Fairness card (PR #51
 * follow-up) -- explains what the card's metrics mean, together, rather
 * than an info icon crowding every individual value. Click/tap/keyboard-
 * activated (never hover-only, so it works identically on mobile), with
 * click-outside and Escape-to-dismiss mirroring the existing
 * `NotificationBell` popover pattern (`components/pwa/NotificationBell.tsx`)
 * rather than inventing a new one or pulling in a tooltip library.
 *
 * This control lives INSIDE the card's own `<Link>` (`ShiftFairnessCard`),
 * so every interaction here -- the trigger AND anything clicked inside the
 * open panel -- calls `preventDefault`/`stopPropagation`: opening the
 * explanation must never also navigate into the person detail overlay.
 */
export function ShiftFairnessCardInfo() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      // Catches a click on ANYTHING inside this control (the panel's own
      // text included) that isn't already handled by the trigger's own
      // handler below -- the card underneath is a `<Link>`, and without
      // this every click here would otherwise navigate into it.
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="הסבר על מדדי הכרטיס"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors duration-150 hover:bg-overlay-soft hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="הסבר על מדדי הכרטיס"
          className="absolute start-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-2xl bg-surface-1 p-4 text-start shadow-[var(--shadow-hero)] ring-1 ring-border-strong"
        >
          <dl className="flex flex-col gap-2.5">
            {METRIC_EXPLANATIONS.map(({ term, meaning }) => (
              <div key={term}>
                <dt className="text-xs font-semibold text-foreground">{term}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-muted">{meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </span>
  );
}
