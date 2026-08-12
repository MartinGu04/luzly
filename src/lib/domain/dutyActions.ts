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

/**
 * Chronological by date, then localTime, then personId -- and then, since
 * the same person can have same-date/same-time actions from two different
 * DutyBlocks (e.g. an oxid block and a rasar block), by the source
 * DutyBlock's own dutyFamily/slot/startDate/endDate. This makes the order
 * a total order: independent of input order, never left to a comparator
 * that returns 0 for genuinely different actions.
 */
function compareDutyActions(a: DerivedDutyAction, b: DerivedDutyAction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.localTime !== b.localTime) return a.localTime < b.localTime ? -1 : 1;
  if (a.personId !== b.personId) return a.personId < b.personId ? -1 : 1;

  const blockA = a.dutyBlock;
  const blockB = b.dutyBlock;
  if (blockA.dutyFamily !== blockB.dutyFamily) return blockA.dutyFamily < blockB.dutyFamily ? -1 : 1;

  const slotA = blockA.slot ?? -1;
  const slotB = blockB.slot ?? -1;
  if (slotA !== slotB) return slotA - slotB;

  if (blockA.startDate !== blockB.startDate) return blockA.startDate < blockB.startDate ? -1 : 1;
  if (blockA.endDate !== blockB.endDate) return blockA.endDate < blockB.endDate ? -1 : 1;

  return 0;
}
