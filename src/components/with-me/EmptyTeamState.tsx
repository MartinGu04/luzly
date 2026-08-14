import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Panel } from "@/components/ui/Panel";

/**
 * Shown only when there is neither a current nor a next shift context --
 * never alongside either section. A compact, calm empty state, never a
 * giant blank card -- and never invents future coworkers. Points
 * somewhere useful (the actual shift calendar) rather than being a dead
 * end.
 */
export function EmptyTeamState() {
  return (
    <Panel variant="hero" className="text-center sm:max-w-xl sm:text-start">
      <span aria-hidden="true" className="text-3xl">
        😌
      </span>
      <p className="mt-3 text-base font-semibold text-foreground">אין כרגע משמרת עם צוות להצגה</p>
      <p className="mt-1.5 text-sm text-muted">כשיהיה שיבוץ קרוב, האנשים שאיתך יופיעו כאן.</p>
      <Link
        href="/schedule"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-overlay-soft px-3.5 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-overlay-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        עבור ללוח המשמרות
        <ArrowLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
      </Link>
    </Panel>
  );
}
