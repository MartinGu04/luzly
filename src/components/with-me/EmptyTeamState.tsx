import { Panel } from "@/components/ui/Panel";

/** Shown only when there is neither a current nor a next shift context -- never alongside either section. */
export function EmptyTeamState() {
  return (
    <Panel variant="hero" className="text-center sm:text-start">
      <span aria-hidden="true" className="text-3xl">
        😌
      </span>
      <p className="mt-3 text-base font-semibold text-foreground">אין כרגע משמרת עם צוות להצגה</p>
      <p className="mt-1.5 text-sm text-muted">כשיהיה שיבוץ קרוב, האנשים שאיתך יופיעו כאן.</p>
    </Panel>
  );
}
