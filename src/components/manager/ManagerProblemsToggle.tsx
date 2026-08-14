import Link from "next/link";
import { TriangleAlert, X } from "lucide-react";
import { buildManagerHref, type ManagerHrefParams } from "@/lib/presentation/managerUrl";

interface ManagerProblemsToggleProps {
  current: ManagerHrefParams;
}

/**
 * "הצג רק בעיות" -- deliberately the command bar's most visually dominant
 * action (Design Pass PR #21 §7), not a quiet corner toggle: OFF is a
 * strong outlined attention treatment with an alert icon; ON is a filled
 * critical treatment ("מציג רק בעיות") with an equally obvious "כל המידע"
 * way back. Server/URL state only (`?problems=1`) -- never a client-side
 * filter over an already-fetched full dataset.
 */
export function ManagerProblemsToggle({ current }: ManagerProblemsToggleProps) {
  const isOn = current.problemsOnly;
  const href = buildManagerHref({ ...current, problemsOnly: !isOn });

  if (isOn) {
    return (
      <Link
        href={href}
        aria-pressed="true"
        className="inline-flex items-center gap-2 rounded-full bg-critical px-3.5 py-1.5 text-sm font-semibold text-critical-foreground shadow-sm ring-1 ring-critical transition-colors duration-200 hover:bg-critical/90"
      >
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2} />
        <span>מציג רק בעיות</span>
        <span className="ms-0.5 inline-flex items-center gap-1 border-s border-critical-foreground/30 ps-2 text-xs font-medium">
          <X className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
          כל המידע
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-pressed="false"
      className="inline-flex items-center gap-1.5 rounded-full bg-critical/[0.06] px-3.5 py-1.5 text-sm font-semibold text-critical ring-2 ring-critical/40 transition-colors duration-200 hover:bg-critical/[0.12]"
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2} />
      הצג רק בעיות
    </Link>
  );
}
