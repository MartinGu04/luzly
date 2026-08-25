import type { QualificationStatus } from "@/lib/domain/shootingRangeQualification";
import type {
  PlannedRangeView,
  ShootingRangeQualificationReadModel,
} from "./buildShootingRangeQualificationReadModel";

export interface ManagerShootingRangeRow {
  personId: string;
  personName: string;
  status: QualificationStatus;
  baselineDate: string | null;
  expiryDate: string | null;
  plannedRange: PlannedRangeView | null;
  hasPendingSelfReport: boolean;
  /** "דורש טיפול": expired, no qualification data at all, nearing expiry, or a past planned range still awaiting manager confirmation. Never true for a valid qualification with only a future planned renewal. */
  requiresAttention: boolean;
}

export interface ManagerShootingRangeSummary {
  /** Currently has an active qualification (valid, or valid-but-nearing-expiry) -- i.e. status is anything except "expired"/"none". */
  qualifiedCount: number;
  /** Subset of `qualifiedCount` inside the nearing-expiry window (<= 30 days). */
  nearingExpiryCount: number;
  /** Expired, or no qualification data at all. */
  notQualifiedCount: number;
  totalCount: number;
}

export interface ManagerPendingSelfReportRow {
  id: string;
  personId: string;
  personName: string;
  performedOn: string;
  notes: string | null;
  createdAt: string;
}

export interface ShootingRangeManagerReadModel {
  summary: ManagerShootingRangeSummary;
  rows: ManagerShootingRangeRow[];
  /** Every open self-report across the whole roster, oldest first (fairest review order) -- the manager review queue. */
  pendingSelfReports: ManagerPendingSelfReportRow[];
}

const QUALIFIED_STATUSES: ReadonlySet<QualificationStatus> = new Set(["valid", "expiring_soon", "expiring_very_soon"]);
const NEARING_EXPIRY_STATUSES: ReadonlySet<QualificationStatus> = new Set(["expiring_soon", "expiring_very_soon"]);

/**
 * Pure manager team-overview builder -- takes one already-built personal
 * `ShootingRangeQualificationReadModel` per person (the exact same
 * function/precedence `buildShootingRangeQualificationReadModel` uses for
 * an individual's own page, never a second/parallel qualification
 * computation) and aggregates them. No network, no auth, no `Date`/UTC.
 */
export function buildShootingRangeManagerReadModel(
  people: readonly { personId: string; personName: string; model: ShootingRangeQualificationReadModel }[],
): ShootingRangeManagerReadModel {
  const rows: ManagerShootingRangeRow[] = people.map(({ personId, personName, model }) => {
    const pendingConfirmation = model.plannedRange?.status === "pending_confirmation";
    const requiresAttention =
      model.status === "expired" ||
      model.status === "none" ||
      NEARING_EXPIRY_STATUSES.has(model.status) ||
      pendingConfirmation;

    return {
      personId,
      personName,
      status: model.status,
      baselineDate: model.baselineDate,
      expiryDate: model.expiryDate,
      plannedRange: model.plannedRange,
      hasPendingSelfReport: model.pendingSelfReport !== null,
      requiresAttention,
    };
  });

  const qualifiedCount = rows.filter((row) => QUALIFIED_STATUSES.has(row.status)).length;
  const nearingExpiryCount = rows.filter((row) => NEARING_EXPIRY_STATUSES.has(row.status)).length;
  const notQualifiedCount = rows.filter((row) => row.status === "expired" || row.status === "none").length;

  const pendingSelfReports: ManagerPendingSelfReportRow[] = people
    .filter(({ model }) => model.pendingSelfReport !== null)
    .map(({ personId, personName, model }) => ({
      id: model.pendingSelfReport!.id,
      personId,
      personName,
      performedOn: model.pendingSelfReport!.performedOn,
      notes: model.pendingSelfReport!.notes,
      createdAt: model.pendingSelfReport!.createdAt,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  return {
    summary: { qualifiedCount, nearingExpiryCount, notQualifiedCount, totalCount: rows.length },
    rows,
    pendingSelfReports,
  };
}
