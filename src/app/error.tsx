"use client";

import { RefreshCcw } from "lucide-react";
import { Panel } from "@/components/ui/Panel";

/**
 * The generic route-level error boundary. Catches anything thrown while
 * loading the schedule (Google/network/server failures) that isn't already
 * handled as a typed `PersonalScheduleLoadResult` state -- e.g. a real
 * transport error from `fetchRawWorkbookSnapshot`.
 *
 * `error.message`/`error.digest` are NEVER rendered -- no stack trace,
 * Google API error text, sheet name, spreadsheet ID, or service-account
 * detail ever reaches this UI. Copy is deliberately generic.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Panel variant="hero" className="w-full max-w-sm text-center">
        <h1 className="text-xl font-bold text-foreground">לא הצלחנו לטעון את הסידור כרגע</h1>
        <p className="mt-2 text-sm text-muted">אפשר לנסות שוב בעוד רגע.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
          נסה שוב
        </button>
      </Panel>
    </div>
  );
}
