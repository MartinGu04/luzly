import { classifyRoleGroup, type FairnessRoleGroupKey } from "@/lib/domain/personnelType";
import type { QualificationStatus } from "@/lib/domain/shootingRangeQualification";
import type {
  PlannedRangeView,
  ShootingRangeQualificationReadModel,
} from "./buildShootingRangeQualificationReadModel";

export interface ManagerShootingRangeRow {
  personId: string;
  personName: string;
  /** The person's connected Google profile photo, resolved in bulk by `shootingRangeManagerOverview.ts` via `personAvatarLookup.ts` -- `null` when they have no connected account or no usable photo; `TeamMemberRow` falls back to initials. */
  avatarUrl: string | null;
  /**
   * "supervisor" (אחמ"ש) or "technician" (טכנאי), via the SAME canonical
   * `classifyRoleGroup` the roster/Fairness views already use -- never a
   * second role-classification scheme. Supervisor takes precedence when a
   * person is both (`classifyRoleGroup`'s own documented rule), so a
   * person is NEVER duplicated across the manager UI's two role sections.
   * Structurally never `"other"` here: every row in this model already
   * passed `isEligibleForShootingRanges` (regular-service AND
   * `isShiftCapable`) upstream, so `isSupervisor || isTechnician` always
   * holds -- the type still allows it only because it's the same shared
   * `FairnessRoleGroupKey` the rest of the domain uses.
   */
  roleGroup: FairnessRoleGroupKey;
  status: QualificationStatus;
  baselineDate: string | null;
  expiryDate: string | null;
  /** The `סיבה / הערה` sheet text for a `status === "not_relevant"` row -- `null` for every other status, and also `null` for a not-relevant row with no reason text (optional by design). */
  notRelevantReason: string | null;
  plannedRange: PlannedRangeView | null;
  hasPendingSelfReport: boolean;
  /**
   * "דורש טיפול": expired, no qualification data at all, nearing expiry, or
   * a past planned range still awaiting manager confirmation. Never true
   * for a valid qualification with only a future planned renewal, and
   * NEVER true for `status === "not_relevant"` regardless of any of the
   * above (spec: "is NOT included in דורשי טיפול") -- a לא רלוונטי person
   * simply isn't a qualification concern right now.
   */
  requiresAttention: boolean;
}

export interface ManagerShootingRangeSummary {
  /** Currently has an active qualification (valid, or valid-but-nearing-expiry) -- i.e. status is anything except "expired"/"none"/"not_relevant". */
  qualifiedCount: number;
  /** Subset of `qualifiedCount` inside the nearing-expiry window (<= 30 days). */
  nearingExpiryCount: number;
  /** Expired, or no qualification data at all -- NEVER includes `"not_relevant"` rows (spec: "do not silently fold לא רלוונטי people into the existing red/green counts"). */
  notQualifiedCount: number;
  /** Eligible people whose sheet row is explicitly `לא רלוונטי` -- excluded from `qualifiedCount`/`notQualifiedCount` both, surfaced here instead so they're never silently invisible from the summary. */
  notRelevantCount: number;
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
  /**
   * Count of "מטווחים" sheet rows that never resolved to exactly one
   * eligible person (an unmatched name, or a genuine ambiguity) --
   * computed by the orchestration loader from the raw parsed sheet, never
   * by this pure builder. Surfaced so a manager can tell "nobody has data"
   * apart from "the sheet has unmatched rows" instead of both looking
   * identical as "אין מידע כשירות" everywhere.
   */
  unresolvedSheetRowCount: number;
  /**
   * The RAW `sourceName` text of every row counted in
   * `unresolvedSheetRowCount`, verbatim (never trimmed/normalized here) --
   * lets a manager visually compare the sheet's own text against כ"א
   * directly in the UI, without needing a dev-only diagnostic script, to
   * spot a real spelling/word-order/invisible-character mismatch
   * themselves. Not sensitive: this text is already visible in the source
   * "מטווחים" sheet the manager already has access to.
   */
  unresolvedSheetRowNames: string[];
}

const QUALIFIED_STATUSES: ReadonlySet<QualificationStatus> = new Set(["valid", "expiring_soon", "expiring_very_soon"]);
const NEARING_EXPIRY_STATUSES: ReadonlySet<QualificationStatus> = new Set(["expiring_soon", "expiring_very_soon"]);

export interface ManagerShootingRangePersonInput {
  personId: string;
  personName: string;
  isSupervisor: boolean;
  isTechnician: boolean;
  avatarUrl: string | null;
  model: ShootingRangeQualificationReadModel;
}

/**
 * Pure manager team-overview builder -- takes one already-built personal
 * `ShootingRangeQualificationReadModel` per person (the exact same
 * function/precedence `buildShootingRangeQualificationReadModel` uses for
 * an individual's own page, never a second/parallel qualification
 * computation) and aggregates them. No network, no auth, no `Date`/UTC.
 */
export function buildShootingRangeManagerReadModel(
  people: readonly ManagerShootingRangePersonInput[],
  unresolvedSheetRowCount = 0,
  unresolvedSheetRowNames: readonly string[] = [],
): ShootingRangeManagerReadModel {
  const rows: ManagerShootingRangeRow[] = people.map(
    ({ personId, personName, isSupervisor, isTechnician, avatarUrl, model }) => {
      const isNotRelevant = model.status === "not_relevant";
      const pendingConfirmation = model.plannedRange?.status === "pending_confirmation";
      const requiresAttention =
        !isNotRelevant &&
        (model.status === "expired" ||
          model.status === "none" ||
          NEARING_EXPIRY_STATUSES.has(model.status) ||
          pendingConfirmation);

      return {
        personId,
        personName,
        avatarUrl,
        roleGroup: classifyRoleGroup({ isSupervisor, isTechnician }),
        status: model.status,
        baselineDate: model.baselineDate,
        expiryDate: model.expiryDate,
        notRelevantReason: model.notRelevantReason,
        plannedRange: model.plannedRange,
        hasPendingSelfReport: model.pendingSelfReport !== null,
        requiresAttention,
      };
    },
  );

  const qualifiedCount = rows.filter((row) => QUALIFIED_STATUSES.has(row.status)).length;
  const nearingExpiryCount = rows.filter((row) => NEARING_EXPIRY_STATUSES.has(row.status)).length;
  const notQualifiedCount = rows.filter((row) => row.status === "expired" || row.status === "none").length;
  const notRelevantCount = rows.filter((row) => row.status === "not_relevant").length;

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
    summary: { qualifiedCount, nearingExpiryCount, notQualifiedCount, notRelevantCount, totalCount: rows.length },
    rows,
    pendingSelfReports,
    unresolvedSheetRowCount,
    unresolvedSheetRowNames: [...unresolvedSheetRowNames],
  };
}
