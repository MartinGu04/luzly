import type { ReactNode } from "react";
import type { PersonalDutyBlock, PersonalEventView } from "@/lib/readModels/types";
import { dutyFamilyLabel, periodLabel, roleLabel } from "@/lib/presentation/labels";
import { formatShortWeekday } from "@/lib/presentation/hebrewDate";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { TimeRange } from "./TimeRange";

interface UpcomingSectionProps {
  upcomingEvents: PersonalEventView[];
  dutyBlocks: PersonalDutyBlock[];
  localNowDate: string;
  /** The date already shown by the hero (its content shouldn't repeat here). */
  heroDate: string | null;
}

interface UpcomingRow {
  key: string;
  date: string;
  endDate?: string;
  title: string;
  meta: string | null;
  time: ReactNode | null;
  tentative: boolean;
}

const MAX_ROWS = 6;

/**
 * "הקרובים שלי" -- a small, deliberately bounded horizon (never the whole
 * spreadsheet). Shift rows come from `upcomingEvents`; duty rows are
 * summarized from `dutyBlocks` so a multi-day duty gets one compact
 * grouped row instead of one row per day.
 */
export function UpcomingSection({ upcomingEvents, dutyBlocks, localNowDate, heroDate }: UpcomingSectionProps) {
  const shiftRows: UpcomingRow[] = upcomingEvents
    .filter((event) => event.category === "shift" && event.date !== heroDate)
    .map((event, index) => ({
      key: `shift-${index}`,
      date: event.date,
      title: event.title,
      meta: [roleLabel(event.role), periodLabel(event.period)].filter(Boolean).join(" · ") || null,
      time:
        event.timing.status === "resolved" ? (
          <TimeRange start={event.timing.startLocalTime} end={event.timing.endLocalTime} />
        ) : null,
      tentative: event.certainty === "tentative",
    }));

  const dutyRows: UpcomingRow[] = dutyBlocks
    .filter((block) => block.endDate >= localNowDate && block.startDate !== heroDate)
    .map((block, index) => ({
      key: `duty-${index}`,
      date: block.startDate,
      endDate: block.endDate !== block.startDate ? block.endDate : undefined,
      title: dutyFamilyLabel(block.dutyFamily) + (block.slot !== null ? ` ${block.slot}` : ""),
      meta: block.dayCount > 1 ? `${block.dayCount} ימים` : null,
      time: null,
      tentative: block.certainty === "tentative" || block.certainty === "mixed",
    }));

  const rows = [...shiftRows, ...dutyRows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(
    0,
    MAX_ROWS,
  );

  return (
    <Panel variant="panel">
      <h3 className="text-sm font-semibold text-foreground">הקרובים שלי</h3>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">אין פריטים נוספים באופק הקרוב.</p>
      ) : (
        <ul className="mt-4 space-y-1">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-white/[0.03]"
            >
              <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-white/[0.04] py-1.5 text-center">
                <span className="text-[10px] font-medium text-muted-2">{formatShortWeekday(row.date)}</span>
                <span dir="ltr" className="text-xs font-semibold text-foreground">
                  {formatDateRangeCompact(row.date, row.endDate)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
                {row.meta ? <p className="truncate text-xs text-muted">{row.meta}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {row.time ? <span className="text-xs text-muted">{row.time}</span> : null}
                {row.tentative ? <Badge tone="warning">משוער</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function formatDateRangeCompact(date: string, endDate?: string): string {
  const [, month, day] = date.split("-");
  const start = `${Number(day)}.${Number(month)}`;
  if (!endDate) return start;
  const [, endMonth, endDay] = endDate.split("-");
  return `${start}–${Number(endDay)}.${Number(endMonth)}`;
}
