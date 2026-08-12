import { CalendarClock, Sparkles } from "lucide-react";
import type {
  PersonalAssignmentView,
  PersonalNextAssignmentGroup,
  PersonalShiftContext,
} from "@/lib/readModels/types";
import { relativeDayLabel, formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import { periodLabel, roleLabel } from "@/lib/presentation/labels";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { CounterpartPanel } from "./CounterpartPanel";
import { PulseIndicator } from "./PulseIndicator";
import { ShiftProgress } from "./ShiftProgress";
import { TimeRange } from "./TimeRange";

interface HeroProps {
  currentAssignments: PersonalAssignmentView[];
  nextAssignmentGroup: PersonalNextAssignmentGroup | null;
  currentShiftContext: PersonalShiftContext | null;
  nextShiftContext: PersonalShiftContext | null;
  fetchedAt: string;
  localNowDate: string;
}

/**
 * The dominant "what is happening to me now?" element. Three states:
 * a current assignment (shift preferred as lead, live pulse + progress),
 * an upcoming one (calmer, countdown only where genuinely known), or a
 * quiet empty state. "Who is with me?" renders embedded in the same
 * surface when relevant -- never a disconnected card.
 */
export function Hero({
  currentAssignments,
  nextAssignmentGroup,
  currentShiftContext,
  nextShiftContext,
  fetchedAt,
  localNowDate,
}: HeroProps) {
  if (currentAssignments.length > 0) {
    return (
      <CurrentHero assignments={currentAssignments} shiftContext={currentShiftContext} fetchedAt={fetchedAt} />
    );
  }

  if (nextAssignmentGroup) {
    return (
      <NextHero
        group={nextAssignmentGroup}
        shiftContext={nextShiftContext}
        fetchedAt={fetchedAt}
        localNowDate={localNowDate}
      />
    );
  }

  return <EmptyHero />;
}

function CurrentHero({
  assignments,
  shiftContext,
  fetchedAt,
}: {
  assignments: PersonalAssignmentView[];
  shiftContext: PersonalShiftContext | null;
  fetchedAt: string;
}) {
  const lead = assignments.find((a) => a.category === "shift") ?? assignments[0];
  const secondary = assignments.filter((a) => a !== lead);
  const meta = describeAssignment(lead);

  return (
    <Panel variant="hero" className="animate-fade-up relative overflow-hidden">
      <div
        aria-hidden="true"
        className="animate-ambient-glow pointer-events-none absolute -top-28 -right-20 h-72 w-72 rounded-full bg-primary/25 blur-3xl"
      />

      <div className="relative flex items-center gap-2 text-sm font-semibold text-primary">
        <PulseIndicator />
        <span>פעיל עכשיו</span>
      </div>

      <h2 className="relative mt-3 text-2xl font-bold text-balance text-foreground sm:text-3xl">{lead.title}</h2>

      {meta ? (
        <p className="relative mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{meta}</span>
          {lead.certainty === "tentative" ? <Badge tone="warning">משוער</Badge> : null}
        </p>
      ) : null}

      {lead.timing.status === "resolved" ? (
        <p className="relative mt-3 text-sm text-muted">
          <TimeRange start={lead.timing.startLocalTime} end={lead.timing.endLocalTime} />
        </p>
      ) : null}

      {lead.category === "shift" && lead.timing.status === "resolved" ? (
        <div className="relative mt-5">
          <ShiftProgress timing={lead.timing} fetchedAt={fetchedAt} mode="current" />
        </div>
      ) : null}

      {secondary.length > 0 ? (
        <div className="relative mt-5 flex flex-wrap gap-2">
          {secondary.map((assignment, index) => (
            <span
              key={index}
              className="rounded-full bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-white/[0.07]"
            >
              {assignment.title}
            </span>
          ))}
        </div>
      ) : null}

      {shiftContext ? (
        <div className="relative mt-6 border-t border-white/[0.06] pt-5">
          <CounterpartPanel context={shiftContext} compact />
        </div>
      ) : null}
    </Panel>
  );
}

function NextHero({
  group,
  shiftContext,
  fetchedAt,
  localNowDate,
}: {
  group: PersonalNextAssignmentGroup;
  shiftContext: PersonalShiftContext | null;
  fetchedAt: string;
  localNowDate: string;
}) {
  const lead = group.events.find((e) => e.category === "shift" && e.timing.status === "resolved") ?? group.events[0];
  const others = group.events.filter((e) => e !== lead);
  const meta = describeAssignment(lead);

  const relDay = relativeDayLabel(group.date, localNowDate);
  const dateLabel =
    relDay === "today" ? "היום" : relDay === "tomorrow" ? "מחר" : (formatHebrewWeekdayAndDate(group.date) ?? "");

  return (
    <Panel variant="hero" className="animate-fade-up">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted">
        <CalendarClock className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
        <span>הבא שלך</span>
      </div>

      <h2 className="mt-3 text-2xl font-bold text-balance text-foreground sm:text-3xl">{lead.title}</h2>

      {meta ? <p className="mt-1.5 text-sm text-muted">{meta}</p> : null}

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>{dateLabel}</span>
        <span aria-hidden="true">·</span>
        {lead.timing.status === "resolved" ? (
          <TimeRange start={lead.timing.startLocalTime} end={lead.timing.endLocalTime} />
        ) : (
          <span>השעה טרם מוגדרת</span>
        )}
        {lead.certainty === "tentative" ? <Badge tone="warning">משוער</Badge> : null}
      </p>

      {lead.timing.status === "resolved" ? (
        <div className="mt-4">
          <ShiftProgress timing={lead.timing} fetchedAt={fetchedAt} mode="upcoming" />
        </div>
      ) : null}

      {others.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {others.map((event, index) => (
            <span
              key={index}
              className="rounded-full bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-white/[0.07]"
            >
              {event.title}
            </span>
          ))}
        </div>
      ) : null}

      {shiftContext ? (
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <CounterpartPanel context={shiftContext} compact />
        </div>
      ) : null}
    </Panel>
  );
}

function EmptyHero() {
  return (
    <Panel variant="hero" className="animate-fade-up text-center sm:text-start">
      <Sparkles className="mx-auto h-6 w-6 text-muted sm:mx-0" aria-hidden="true" strokeWidth={1.5} />
      <h2 className="mt-3 text-xl font-bold text-foreground">הכול שקט כרגע</h2>
      <p className="mt-1.5 text-sm text-muted">אין לך שיבוצים קרובים בלוח.</p>
    </Panel>
  );
}

/** "אחמ״ש · יום" -- role/period metadata line for a shift; null for a duty (nothing meaningful to add beyond its title). */
function describeAssignment(assignment: PersonalAssignmentView): string | null {
  if (assignment.category !== "shift") return null;
  const role = roleLabel(assignment.role);
  const period = periodLabel(assignment.period);
  const parts = [role, period].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}
