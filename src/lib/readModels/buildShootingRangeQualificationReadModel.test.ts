import { describe, expect, it } from "vitest";
import {
  buildShootingRangeQualificationReadModel,
  type BuildShootingRangeQualificationReadModelInput,
} from "./buildShootingRangeQualificationReadModel";
import type { CompletionRow, PlannedOccurrenceRow } from "@/lib/shootingRanges/store";
import type { ShootingRangeSheetRecord } from "@/lib/parsers/shootingRanges";

function baseInput(overrides: Partial<BuildShootingRangeQualificationReadModelInput> = {}): BuildShootingRangeQualificationReadModelInput {
  return {
    personId: "p1",
    sheetBaseline: null,
    completions: [],
    plannedOccurrences: [],
    today: "2026-08-25",
    ...overrides,
  };
}

function sheetRecord(performedOn: string): ShootingRangeSheetRecord {
  return { sourceName: "מרטין בדיקה", resolvedPersonId: "p1", performedOn, sourceSheet: "מטווחים", sourceCell: "A2" };
}

function completion(overrides: Partial<CompletionRow> = {}): CompletionRow {
  return {
    id: "c1",
    personId: "p1",
    performedOn: "2026-06-29",
    source: "self_report",
    status: "pending",
    notes: null,
    submittedByPersonId: "p1",
    submittedByPersonName: "מרטין בדיקה",
    approvedByPersonId: null,
    approvedByPersonName: null,
    approvedAt: null,
    linkedPlannedDate: null,
    createdAt: "2026-06-29T10:00:00.000Z",
    ...overrides,
  };
}

function plannedOccurrence(overrides: Partial<PlannedOccurrenceRow> = {}): PlannedOccurrenceRow {
  return {
    id: "o1",
    rangeDate: "2026-09-03",
    personId: "p1",
    status: "planned",
    createdByPersonId: "mgr1",
    createdByPersonName: "מנהל בדיקה",
    resolvedByPersonId: null,
    resolvedByPersonName: null,
    resolvedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildShootingRangeQualificationReadModel -- source precedence", () => {
  it("A. sheet baseline alone -> 29/06/2026 baseline, expiry 29/12/2026, valid through 29/12", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({ sheetBaseline: sheetRecord("2026-06-29"), today: "2026-12-29" }),
    );
    expect(model.baselineDate).toBe("2026-06-29");
    expect(model.baselineSource).toBe("sheet");
    expect(model.expiryDate).toBe("2026-12-29");
    expect(model.status).not.toBe("expired");
  });

  it("A. invalid the day after expiry", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({ sheetBaseline: sheetRecord("2026-06-29"), today: "2026-12-30" }),
    );
    expect(model.status).toBe("expired");
  });

  it("A. no sheet row at all -> no qualification data, never fabricated", () => {
    const model = buildShootingRangeQualificationReadModel(baseInput());
    expect(model.baselineDate).toBeNull();
    expect(model.baselineSource).toBeNull();
    expect(model.expiryDate).toBeNull();
    expect(model.status).toBe("none");
  });

  it("A. a manually-wrong sheet status cell has no representation here at all (the sheet record type doesn't even carry one)", () => {
    // ShootingRangeSheetRecord structurally has no status/expiry field --
    // this test exists to document that guarantee at the read-model layer.
    const record = sheetRecord("2026-06-29");
    expect(Object.keys(record)).not.toContain("status");
    expect(Object.keys(record)).not.toContain("expiry");
  });

  it("B. an approved app completion unconditionally wins over the sheet baseline, regardless of dates", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        sheetBaseline: sheetRecord("2026-01-01"),
        completions: [completion({ id: "app1", performedOn: "2026-03-01", status: "approved", source: "manager_manual" })],
        today: "2026-03-15",
      }),
    );
    expect(model.baselineDate).toBe("2026-03-01");
    expect(model.baselineSource).toBe("app");
  });

  it("B. a later workbook refresh with an OLDER sheet date never reverts an already-approved app baseline", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        sheetBaseline: sheetRecord("2026-01-01"), // stale refresh, still present in the sheet
        completions: [completion({ id: "app1", performedOn: "2026-03-01", status: "approved" })],
        today: "2026-03-15",
      }),
    );
    expect(model.baselineDate).toBe("2026-03-01");
    expect(model.baselineSource).toBe("app");
  });

  it("C. a new VERIFIED early range resets the baseline -- no carry-over of unused old validity", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        completions: [
          completion({ id: "old", performedOn: "2026-01-15", status: "approved" }), // would have been valid until July
          completion({ id: "new", performedOn: "2026-10-01", status: "approved" }), // new, earlier-in-the-cycle range
        ],
        today: "2026-10-05",
      }),
    );
    expect(model.baselineDate).toBe("2026-10-01");
    expect(model.expiryDate).toBe("2027-04-01");
  });

  it("F. a pending self-report alone never renews validity", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        sheetBaseline: sheetRecord("2026-01-01"),
        completions: [completion({ id: "sr1", performedOn: "2026-08-20", status: "pending" })],
        today: "2026-08-25",
      }),
    );
    expect(model.baselineDate).toBe("2026-01-01");
    expect(model.baselineSource).toBe("sheet");
    expect(model.pendingSelfReport).toEqual({ id: "sr1", performedOn: "2026-08-20", notes: null, createdAt: "2026-06-29T10:00:00.000Z" });
  });

  it("F. a rejected self-report never renews validity either", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        completions: [completion({ id: "sr1", performedOn: "2026-08-20", status: "rejected" })],
        today: "2026-08-25",
      }),
    );
    expect(model.baselineDate).toBeNull();
    expect(model.pendingSelfReport).toBeNull();
  });
});

describe("buildShootingRangeQualificationReadModel -- planned / pending confirmation", () => {
  it("D. a future planned occurrence shows as planned and never changes baseline/expiry", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        sheetBaseline: sheetRecord("2026-01-01"),
        plannedOccurrences: [plannedOccurrence({ rangeDate: "2026-09-03" })],
        today: "2026-08-25",
      }),
    );
    expect(model.plannedRange).toEqual({ rangeDate: "2026-09-03", status: "planned" });
    expect(model.baselineDate).toBe("2026-01-01");
  });

  it("D. once the date passes, an unresolved occurrence becomes pending_confirmation -- still no baseline/expiry change", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        sheetBaseline: sheetRecord("2026-01-01"),
        plannedOccurrences: [plannedOccurrence({ rangeDate: "2026-09-03" })],
        today: "2026-09-04",
      }),
    );
    expect(model.plannedRange).toEqual({ rangeDate: "2026-09-03", status: "pending_confirmation" });
    expect(model.baselineDate).toBe("2026-01-01");
    expect(model.expiryDate).toBe("2026-07-01");
  });

  it("a confirmed/not_completed occurrence is never surfaced as the active planned range again", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        plannedOccurrences: [plannedOccurrence({ rangeDate: "2026-09-03", status: "confirmed" })],
        today: "2026-09-10",
      }),
    );
    expect(model.plannedRange).toBeNull();
  });

  it("a range scheduled for TODAY stays 'planned' for the whole day -- it has not 'finished' yet", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        plannedOccurrences: [plannedOccurrence({ rangeDate: "2026-09-03" })],
        today: "2026-09-03",
      }),
    );
    expect(model.plannedRange).toEqual({ rangeDate: "2026-09-03", status: "planned" });
  });

  it("a past-due unresolved occurrence takes priority over a future one", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        plannedOccurrences: [
          plannedOccurrence({ id: "future", rangeDate: "2026-10-01" }),
          plannedOccurrence({ id: "overdue", rangeDate: "2026-09-01" }),
        ],
        today: "2026-09-05",
      }),
    );
    expect(model.plannedRange).toEqual({ rangeDate: "2026-09-01", status: "pending_confirmation" });
  });
});

describe("buildShootingRangeQualificationReadModel -- history", () => {
  it("includes the sheet baseline and every completion claim, sorted newest first", () => {
    const model = buildShootingRangeQualificationReadModel(
      baseInput({
        sheetBaseline: sheetRecord("2025-01-01"),
        completions: [
          completion({ id: "c1", performedOn: "2026-03-01", status: "approved", source: "manager_manual" }),
          completion({ id: "c2", performedOn: "2026-08-01", status: "rejected", source: "self_report" }),
        ],
      }),
    );
    expect(model.history.map((entry) => entry.performedOn)).toEqual(["2026-08-01", "2026-03-01", "2025-01-01"]);
    expect(model.history[2].source).toBe("sheet_baseline");
  });
});
