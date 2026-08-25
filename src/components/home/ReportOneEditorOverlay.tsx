"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, RotateCcw, X } from "lucide-react";
import type { ReportOneDraft } from "@/lib/domain/reportOne";
import { formatReportOneText, formatReportOneTitle } from "@/lib/presentation/reportOneFormat";

interface ReportOneEditorOverlayProps {
  draft: ReportOneDraft;
  onClose: () => void;
}

/** Same SSR-safe "mounted on the client yet" primitive `FairnessDetailOverlay` uses, so `createPortal(..., document.body)` is never evaluated during the server render pass. */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function buildGeneratedStatusMap(draft: ReportOneDraft): Record<string, string> {
  const map: Record<string, string> = {};
  for (const section of draft.sections) {
    for (const person of section.people) {
      map[person.personId] = person.generatedStatus;
    }
  }
  return map;
}

const COPIED_RESET_MS = 2000;

/**
 * The "דוח 1 למחר" editable draft -- mobile bottom sheet / desktop centered
 * modal, one responsive component (same Tailwind-breakpoint approach
 * `FairnessDetailOverlay` uses), but URL-independent local `open`/`onClose`
 * state like `CommandPalette`, since this is triggered from a Home quick
 * action rather than a navigable list row.
 *
 * Editing is local-only (V1 has no persistence): `edits` starts as a copy
 * of every person's `generatedStatus` and is never written back anywhere
 * except the clipboard. "איפוס לטיוטה האוטומטית" restores `edits` from the
 * draft's own generated values and discards manual changes -- with an
 * inline confirm (no modal dependency, matching `CalendarSyncSection`'s
 * existing `confirmTarget` pattern) whenever there's something to lose.
 */
export function ReportOneEditorOverlay({ draft, onClose }: ReportOneEditorOverlayProps) {
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const generatedStatusById = useMemo(() => buildGeneratedStatusMap(draft), [draft]);
  const [edits, setEdits] = useState<Record<string, string>>(generatedStatusById);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = useMemo(
    () => Object.keys(generatedStatusById).some((personId) => edits[personId] !== generatedStatusById[personId]),
    [edits, generatedStatusById],
  );

  useEffect(() => {
    if (!mounted) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [mounted]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialogNode = dialogRef.current;
      if (!dialogNode) return;

      const focusable = getFocusableElements(dialogNode);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogNode.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogNode.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const setPersonStatus = useCallback((personId: string, value: string) => {
    setEdits((current) => ({ ...current, [personId]: value }));
  }, []);

  const requestReset = useCallback(() => {
    if (!isDirty) {
      setEdits(generatedStatusById);
      return;
    }
    setConfirmingReset(true);
  }, [isDirty, generatedStatusById]);

  const confirmReset = useCallback(() => {
    setEdits(generatedStatusById);
    setConfirmingReset(false);
  }, [generatedStatusById]);

  const copyReport = useCallback(async () => {
    const text = formatReportOneText(draft, edits);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard access can fail (permissions, insecure context) -- the
      // report text still exists on-screen for a manual copy, so this is
      // silent rather than surfacing a scary error for a non-critical action.
    }
  }, [draft, edits]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div role="presentation" aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="דוח 1 למחר"
        className="relative flex max-h-[90vh] w-full flex-col rounded-t-xl bg-surface-1 shadow-[var(--shadow-elevated)] ring-1 ring-border-strong lg:max-h-[85vh] lg:w-[560px] lg:max-w-[90vw] lg:rounded-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="truncate text-base font-semibold text-foreground">{formatReportOneTitle(draft.targetDate)}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">
            {draft.sections.map((section) => (
              <div key={section.section}>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{section.label}</h3>
                {section.people.length === 0 ? (
                  <p className="text-sm text-muted">אין אנשי צוות בקבוצה זו.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {section.people.map((person) => {
                      const isUnresolved = edits[person.personId] === "?";
                      return (
                        <li key={person.personId} className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-foreground">{person.name}</span>
                          <input
                            type="text"
                            value={edits[person.personId] ?? ""}
                            onChange={(event) => setPersonStatus(person.personId, event.target.value)}
                            className={`w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              isUnresolved ? "ring-critical/60" : "ring-border"
                            }`}
                            aria-label={`סטטוס עבור ${person.name}`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          {confirmingReset ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">קיימים שינויים ידניים שיימחקו. לאפס לטיוטה האוטומטית?</span>
              <button
                type="button"
                onClick={confirmReset}
                className="rounded-lg bg-critical px-3 py-1.5 text-sm font-medium text-critical-foreground transition-colors duration-150 hover:opacity-90"
              >
                אישור
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-overlay-soft"
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={requestReset}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-overlay-soft"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
              איפוס לטיוטה האוטומטית
            </button>
          )}

          <button
            type="button"
            onClick={copyReport}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:opacity-90"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
            )}
            {copied ? "הדוח הועתק" : "העתק דוח"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
