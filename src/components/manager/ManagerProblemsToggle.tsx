import Link from "next/link";
import { buildManagerHref, type ManagerHrefParams } from "@/lib/presentation/managerUrl";

interface ManagerProblemsToggleProps {
  current: ManagerHrefParams;
}

/** "הצג רק בעיות" -- server/URL state only (`?problems=1`), never a client-side full-dataset filter. */
export function ManagerProblemsToggle({ current }: ManagerProblemsToggleProps) {
  const isOn = current.problemsOnly;
  const href = buildManagerHref({ ...current, problemsOnly: !isOn });

  return (
    <Link
      href={href}
      aria-pressed={isOn}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors duration-200 ${
        isOn
          ? "bg-critical/[0.08] text-critical ring-critical/20"
          : "text-muted ring-border hover:text-foreground"
      }`}
    >
      {isOn ? "כל המידע" : "הצג רק בעיות"}
    </Link>
  );
}
