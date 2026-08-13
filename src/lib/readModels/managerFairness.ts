import "server-only";
import { resolveFairnessPeriod, type FairnessPeriodKey } from "@/lib/domain/fairnessPeriod";
import type { SheetSourceKey } from "@/lib/google";
import { parseFairnessTable } from "@/lib/parsers/fairness";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildManagerFairnessReadModel } from "./buildManagerFairnessReadModel";
import { getManagerWorkbookSheet, loadManagerWorkbookContext } from "./managerWorkbookContext";
import type { ManagerFairnessParams } from "./managerFairnessParams";
import type { ManagerFairnessReadModel } from "./managerFairnessTypes";

export type ManagerFairnessLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  /** Authenticated + mapped, but `person.isManager !== true` -- no manager-wide fetch was ever performed. */
  | { status: "forbidden" }
  | { status: "ok"; model: ManagerFairnessReadModel };

const PERIOD_SHEET_KEYS: Record<FairnessPeriodKey, SheetSourceKey> = {
  h1: "potentialH1",
  h2: "potentialH2",
};

/**
 * Server-only orchestration for `ManagerFairnessReadModel` (PR #15 §4).
 * Shares the exact same authorization + manager-wide fetch boundary as
 * Manager Overview via `loadManagerWorkbookContext()` -- no additional
 * Google fetch is ever introduced here: the manager batch already includes
 * both `potentialH1` and `potentialH2`, and this only picks the ONE sheet
 * the resolved period needs and structurally parses its Fairness table.
 */
export async function loadManagerFairnessReadModel(
  params: ManagerFairnessParams,
): Promise<ManagerFairnessLoadResult> {
  const contextResult = await loadManagerWorkbookContext();
  if (contextResult.status !== "ok") return contextResult;

  const { manager, people, snapshot } = contextResult.context;

  const now = getJerusalemLocalNow();
  const period = resolveFairnessPeriod(params.period, now);

  const sheet = getManagerWorkbookSheet(snapshot, PERIOD_SHEET_KEYS[period]);
  const parseResult = parseFairnessTable(sheet, people);

  const model = buildManagerFairnessReadModel({
    manager,
    parseResult,
    period,
    fetchedAt: snapshot.fetchedAt,
    now,
    selectedPersonId: params.personId,
  });

  return { status: "ok", model };
}
