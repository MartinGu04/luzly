import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";

export interface EmergencyFairnessPersonRow {
  personId: string;
  personName: string;
  total: number;
  day: number;
  night: number;
}

export interface EmergencyFairnessGroupView {
  label: string;
  rows: EmergencyFairnessPersonRow[];
}

export interface EmergencyFairnessReadModel {
  /** The currently active Emergency Mode period, if any -- display-only (e.g. "מצב חירום פעיל מאז..."). Counts below always reflect the FULL emergency workbook history, not scoped to this one period -- a past, already-deactivated emergency's fairness data remains visible. */
  activePeriod: EmergencyModePeriod | null;
  fetchedAt: string;
  /** Canonical group order first, then the fallback group last -- only groups with at least one row are included. */
  groups: EmergencyFairnessGroupView[];
}
