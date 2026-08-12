import type { DutyBlock } from "./dutyBlocks";
import type { Event } from "./event";

export type DerivedDutyActionType = "duty_check_in";

/**
 * Data only -- not an actual notification. No Notification API, no
 * service worker, no cron, no push subscription, nothing is sent. This is
 * the machine-readable intent a future notification/UI layer can consume.
 */
export interface DerivedDutyAction {
  type: DerivedDutyActionType;
  personId: string;
  /** "YYYY-MM-DD" -- the local schedule date the action fires on. */
  date: string;
  /** Local clock time, always "13:00" for duty_check_in. Never converted to UTC. */
  localTime: string;
  dutyBlock: DutyBlock;
  /** The Event(s) on this specific action date, for source-evidence traceability. */
  sourceEvents: Event[];
}

const DUTY_CHECK_IN_LOCAL_TIME = "13:00";

/**
 * One-day block -> one duty_check_in action on that same date at 13:00.
 * Multi-day block -> one action on every actual date EXCEPT the final one
 * (the last day never gets a check-in). This is the same rule for every
 * duty family, including weekend_kitchen -- no second, family-specific
 * reminder engine. Dates come only from what's actually in the block
 * (`dutyBlock.dates`); no calendar holes are ever filled.
 */
export function deriveDutyActions(blocks: readonly DutyBlock[]): DerivedDutyAction[] {
  const actions: DerivedDutyAction[] = [];

  for (const block of blocks) {
    const actionDates = block.dates.length <= 1 ? block.dates : block.dates.slice(0, -1);

    for (const date of actionDates) {
      actions.push({
        type: "duty_check_in",
        personId: block.personId,
        date,
        localTime: DUTY_CHECK_IN_LOCAL_TIME,
        dutyBlock: block,
        sourceEvents: block.events.filter((event) => event.date === date),
      });
    }
  }

  return actions.sort(compareDutyActions);
}

/** Chronological by date, then localTime, then personId as a stable secondary key. */
function compareDutyActions(a: DerivedDutyAction, b: DerivedDutyAction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.localTime !== b.localTime) return a.localTime < b.localTime ? -1 : 1;
  if (a.personId !== b.personId) return a.personId < b.personId ? -1 : 1;
  return 0;
}
