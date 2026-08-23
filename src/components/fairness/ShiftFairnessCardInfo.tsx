"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

const METRIC_EXPLANATIONS: readonly { term: string; meaning: string }[] = [
  { term: "משמרות שבוצעו", meaning: "מספר המשמרות שהאדם ביצע בפועל בתקופה שנבחרה." },
  {
    term: "צפי",
    meaning:
      "לא יעד חודשי קבוע -- הערכה של מספר המשמרות שהוגן לצפות מהאדם הזה עד היום, בהתאם לזמינות שהייתה לו בפועל בתקופה. ההערכה מושפעת מהיעדרויות (כולל מחלה/גימלים), אילוצי זמינות והפניות שנרשמו לו -- ולכן היא עשויה להיות שונה בין אנשים, גם אם ביצעו אותו מספר משמרות בפועל.",
  },
  {
    term: "מצב מול הצפי",
    meaning: "האם מספר המשמרות שבוצעו בפועל גבוה, נמוך, או תואם את הצפי המותאם עד היום -- כולל גודל הפער.",
  },
  {
    term: 'סופ"שים',
    meaning:
      'מספר סופי השבוע (חמישי-שישי-שבת) הנפרדים שבהם בוצעה לפחות משמרת אחת בפועל -- לא מספר המשמרות שבוצעו בסופ"ש. למשל, משמרות ביום חמישי, שישי ושבת של אותו סוף שבוע נספרות כסוף שבוע אחד.',
  },
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
 * `ShiftFairnessCard` renders this as a SIBLING of the card's own person-
 * detail `<Link>`, never a descendant -- a `<button>` nested inside an
 * `<a>` is invalid, inaccessible interactive-in-interactive markup. The
 * Link is an absolutely-positioned overlay spanning the whole card
 * (lower z-index); this control's own root carries a HIGHER z-index
 * (`z-20` below) so it -- and its popover -- visually sit in the exact
 * same spot they always have, while actually receiving the click/tap
 * instead of the Link underneath. `preventDefault`/`stopPropagation` are
 * kept anyway as a defensive belt-and-suspenders measure, not because
 * sibling markup can bubble into the Link (it can't).
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
      className="relative z-20 inline-flex"
      // Defensive belt-and-suspenders: this control is a SIBLING of the
      // card's <Link>, not a descendant, so a click here has no DOM path
      // to bubble into the Link's own navigation in the first place. Kept
      // anyway in case this is ever reused somewhere it IS nested.
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
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors duration-150 hover:bg-overlay-soft hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="הסבר על מדדי הכרטיס"
          className="absolute start-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-xl bg-surface-1 p-4 text-start shadow-[var(--shadow-elevated)] ring-1 ring-border-strong"
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
