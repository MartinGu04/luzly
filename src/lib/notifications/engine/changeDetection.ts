import "server-only";
import type { Event } from "@/lib/domain/event";
import type { Person } from "@/lib/domain/types";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { OperationalWeek } from "@/lib/domain/operationalWeek";
import { computeSemanticFacts } from "./semanticFacts";
import { diffSemanticFacts, type FactChange } from "./diffFacts";
import { buildSettledChangeCopy } from "./copy";
import { filterManagerRecipients, type RecipientResolution, type ResolvedRecipient } from "./recipients";
import type { CoverageFactValue } from "./semanticFacts";
import {
  advanceNotificationBaseline,
  applyPendingChanges,
  claimDuePendingChanges,
  clearWeekState,
  countOpenPendingChanges,
  deletePendingChange,
  getObservedFacts,
  insertNotificationJobIfAbsent,
  peekBaselineState,
  peekDuePendingChangesCount,
  seedObservedFacts,
  setObservedFact,
} from "./store";

export interface ChangeDetectionSummary {
  currentWeek: string;
  baselineAction: "initialized" | "rolled_over" | "unchanged";
  semanticChangesDetected: number;
  pendingChangesOpen: number;
  settledChanges: number;
  jobsCreated: number;
}

export interface ChangeDetectionInput {
  events: readonly Event[];
  people: readonly Person[];
  shiftSchedule: ShiftSchedule;
  week: OperationalWeek;
  persist: boolean;
  recipientResolution: RecipientResolution;
  personNameById: ReadonlyMap<string, string>;
}

const CATEGORY_TO_JOB_CATEGORY: Record<string, string> = {
  shift: "shift_change",
  team: "team_change",
  duty: "duty_change",
  coverage: "coverage_gap",
};

const SILENT_SUMMARY_BASE = {
  semanticChangesDetected: 0,
  pendingChangesOpen: 0,
  settledChanges: 0,
  jobsCreated: 0,
} as const;

/**
 * Phases 3-8 of the worker pipeline (PR #30 spec section 23): resolve the
 * current operational week, silently initialize/roll the baseline (spec
 * section 9), normalize current-week state into semantic facts (section
 * 10), diff against the last settled truth, and apply/settle the
 * 10-minute quiet-period debounce (section 11). In `persist: false`
 * (dry-run) mode, every WRITE is skipped -- this function only ever reads
 * existing state and computes what a real tick would do, never mutating
 * baseline/observed/pending state and never creating a job.
 */
export async function runChangeDetection(input: ChangeDetectionInput): Promise<ChangeDetectionSummary> {
  const { week, persist } = input;
  const weekEvents = input.events.filter((event) => week.dates.includes(event.date));
  const freshFacts = computeSemanticFacts(weekEvents, input.shiftSchedule, week);

  const { action: baselineAction, previousWeekStart } = await resolveBaselineTransition(week.weekStart, persist);

  if (baselineAction === "initialized") {
    if (persist) await seedObservedFacts(week.weekStart, freshFacts);
    return { currentWeek: week.weekStart, baselineAction, ...SILENT_SUMMARY_BASE };
  }

  if (baselineAction === "rolled_over") {
    if (persist) {
      // The previous week's stale state must never leak into the new
      // week's diff base, and must never itself generate change
      // notifications just because the week rolled over (spec section 9).
      if (previousWeekStart) await clearWeekState(previousWeekStart);
      await seedObservedFacts(week.weekStart, freshFacts);
    }
    return { currentWeek: week.weekStart, baselineAction, ...SILENT_SUMMARY_BASE };
  }

  // "unchanged" -- the ordinary diff/debounce/settle flow.
  const observedFacts = await getObservedFacts(week.weekStart);
  const changes = diffSemanticFacts(observedFacts, freshFacts);

  if (persist) {
    await applyPendingChanges(week.weekStart, changes, freshFacts);
  }

  let settledChanges = 0;
  let jobsCreated = 0;

  if (persist) {
    const claimed = await claimDuePendingChanges();
    for (const pending of claimed) {
      settledChanges++;
      const change: FactChange = {
        factKey: pending.factKey,
        category: pending.category,
        oldValue: pending.originalValue,
        newValue: pending.latestValue,
      };
      jobsCreated += await settleOneChange(week.weekStart, pending.id, change, input);
    }
  } else {
    settledChanges = await peekDuePendingChangesCount(week.weekStart);
  }

  const pendingChangesOpen = await countOpenPendingChanges(week.weekStart);

  return {
    currentWeek: week.weekStart,
    baselineAction,
    semanticChangesDetected: changes.length,
    pendingChangesOpen,
    settledChanges,
    jobsCreated,
  };
}

/**
 * The single decision point for first-run/rollover/unchanged. In
 * `persist` mode this calls the atomic `advance_notification_baseline`
 * RPC exactly once (its row lock is what makes concurrent worker
 * invocations safe -- see the migration's own comment) and trusts its
 * return value directly, rather than re-deriving the decision from a
 * second read. In dry-run mode there is nothing to lock/commit, so a
 * plain read-only peek is used instead.
 */
async function resolveBaselineTransition(
  weekStart: string,
  persist: boolean,
): Promise<{ action: "initialized" | "rolled_over" | "unchanged"; previousWeekStart: string | null }> {
  if (persist) {
    const result = await advanceNotificationBaseline(weekStart);
    return { action: result.action, previousWeekStart: result.previousWeekStart };
  }

  const state = await peekBaselineState();
  if (!state.initialized) return { action: "initialized", previousWeekStart: null };
  if (state.currentWeekStart !== weekStart) {
    return { action: "rolled_over", previousWeekStart: state.currentWeekStart };
  }
  return { action: "unchanged", previousWeekStart: state.currentWeekStart };
}

async function settleOneChange(
  weekStart: string,
  pendingId: string,
  change: FactChange,
  input: ChangeDetectionInput,
): Promise<number> {
  await setObservedFact(weekStart, change.factKey, change.category, change.newValue);
  await deletePendingChange(pendingId);

  if (change.category === "coverage") {
    const oldStatus = (change.oldValue as CoverageFactValue | null)?.status;
    const newStatus = (change.newValue as CoverageFactValue | null)?.status;
    // Only a genuine "valid coverage -> gap" transition is meaningful
    // (spec section 15) -- an unchanged gap, a resolution, or a drift
    // into "not_evaluable" never creates a job.
    if (newStatus !== "missing" || oldStatus === "missing") return 0;
  }

  const copy = buildSettledChangeCopy(change, input.personNameById);
  if (!copy) return 0;

  const recipients: ResolvedRecipient[] =
    change.category === "coverage"
      ? filterManagerRecipients(input.people, input.recipientResolution)
      : resolvePersonRecipient(change.factKey, input.recipientResolution);

  let jobsCreated = 0;
  for (const recipient of recipients) {
    const created = await insertNotificationJobIfAbsent({
      category: CATEGORY_TO_JOB_CATEGORY[change.category] ?? change.category,
      recipientUserId: recipient.userId,
      title: copy.title,
      body: copy.body,
      path: copy.path,
      tag: copy.tag,
      dedupeKey: `settle:${pendingId}:${recipient.userId}`,
      scheduledFor: new Date().toISOString(),
      sourceRef: change.factKey,
    });
    if (created) jobsCreated++;
  }
  return jobsCreated;
}

function resolvePersonRecipient(factKey: string, resolution: RecipientResolution): ResolvedRecipient[] {
  const personId = factKey.split(":")[1];
  const recipient = resolution.resolved.get(personId);
  return recipient ? [recipient] : [];
}
