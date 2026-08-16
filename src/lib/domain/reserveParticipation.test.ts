import { describe, expect, it } from "vitest";
import type { FairnessPersonRow } from "./fairnessTable";
import {
  deriveReserveRoleParticipation,
  EMPTY_RESERVE_ROLE_PARTICIPATION,
  resolveReserveRoleParticipation,
  type ReserveRoleParticipationByPeriod,
  type ReserveRoleParticipationSource,
} from "./reserveParticipation";

let cellCounter = 0;
function row(overrides: Partial<FairnessPersonRow> = {}): FairnessPersonRow {
  cellCounter += 1;
  return {
    sourceName: "מועמד",
    resolvedPersonId: "p_1",
    allocationLabel: "טכנאי",
    previousScore: 10,
    currentScore: 12,
    weekendCount: 2,
    exemptions: [],
    sourceSheet: 'פוטנציאל תקש"אס 1-6/2026',
    sourceCell: `C${cellCounter}`,
    ...overrides,
  };
}

describe("deriveReserveRoleParticipation", () => {
  it("an empty table produces empty participation, never a default/guessed member", () => {
    const result = deriveReserveRoleParticipation([]);
    expect(result.technicianPersonIds.size).toBe(0);
    expect(result.supervisorPersonIds.size).toBe(0);
  });

  it("a resolved 'טכנאי' row adds the person to the technician set only", () => {
    const result = deriveReserveRoleParticipation([row({ resolvedPersonId: "p_1", allocationLabel: "טכנאי" })]);
    expect(result.technicianPersonIds.has("p_1")).toBe(true);
    expect(result.supervisorPersonIds.has("p_1")).toBe(false);
  });

  it('a resolved \'אחמ"ש\' row adds the person to the supervisor set only', () => {
    const result = deriveReserveRoleParticipation([row({ resolvedPersonId: "p_1", allocationLabel: 'אחמ"ש' })]);
    expect(result.supervisorPersonIds.has("p_1")).toBe(true);
    expect(result.technicianPersonIds.has("p_1")).toBe(false);
  });

  it("an UNRESOLVED row (resolvedPersonId: null -- ambiguous/duplicate/unmatched name) contributes to neither set", () => {
    const result = deriveReserveRoleParticipation([row({ resolvedPersonId: null, allocationLabel: "טכנאי" })]);
    expect(result.technicianPersonIds.size).toBe(0);
    expect(result.supervisorPersonIds.size).toBe(0);
  });

  it("an UNKNOWN allocation label (not 'טכנאי'/'אחמ\"ש') contributes to neither set", () => {
    const result = deriveReserveRoleParticipation([
      row({ resolvedPersonId: "p_1", allocationLabel: 'ר"צ' }),
      row({ resolvedPersonId: "p_1", allocationLabel: "הסמכה" }),
    ]);
    expect(result.technicianPersonIds.size).toBe(0);
    expect(result.supervisorPersonIds.size).toBe(0);
  });

  it("never reads scores/exemptions/weekend counts -- a row with an extreme/negative score still only contributes role membership", () => {
    const result = deriveReserveRoleParticipation([
      row({ resolvedPersonId: "p_1", allocationLabel: "טכנאי", previousScore: -999, currentScore: null, weekendCount: null, exemptions: ["פטור"] }),
    ]);
    expect(result.technicianPersonIds.has("p_1")).toBe(true);
  });

  it("distinct people each resolve independently -- one row per person, both counted", () => {
    const result = deriveReserveRoleParticipation([
      row({ resolvedPersonId: "p_1", allocationLabel: "טכנאי" }),
      row({ resolvedPersonId: "p_2", allocationLabel: 'אחמ"ש' }),
    ]);
    expect(result.technicianPersonIds.has("p_1")).toBe(true);
    expect(result.supervisorPersonIds.has("p_2")).toBe(true);
    expect(result.technicianPersonIds.has("p_2")).toBe(false);
  });
});

describe("EMPTY_RESERVE_ROLE_PARTICIPATION", () => {
  it("is genuinely empty on both sides -- the safe default for 'no evidence at all'", () => {
    expect(EMPTY_RESERVE_ROLE_PARTICIPATION.technicianPersonIds.size).toBe(0);
    expect(EMPTY_RESERVE_ROLE_PARTICIPATION.supervisorPersonIds.size).toBe(0);
  });
});

describe("resolveReserveRoleParticipation -- PR #39 year-safety", () => {
  function source(year: number | null, technicianIds: string[] = []): ReserveRoleParticipationSource {
    return { year, participation: { technicianPersonIds: new Set(technicianIds), supervisorPersonIds: new Set() } };
  }

  const EMPTY_SOURCE = source(null);

  function byPeriod(h1: ReserveRoleParticipationSource, h2: ReserveRoleParticipationSource): ReserveRoleParticipationByPeriod {
    return { h1, h2 };
  }

  it("returns the h1 source's participation when the requested year matches", () => {
    const evidence = source(2026, ["p_1"]);
    const result = resolveReserveRoleParticipation(byPeriod(evidence, EMPTY_SOURCE), { key: "h1", year: 2026 });
    expect(result.technicianPersonIds.has("p_1")).toBe(true);
  });

  it("returns the h2 source's participation when the requested year matches", () => {
    const evidence = source(2026, ["p_1"]);
    const result = resolveReserveRoleParticipation(byPeriod(EMPTY_SOURCE, evidence), { key: "h2", year: 2026 });
    expect(result.technicianPersonIds.has("p_1")).toBe(true);
  });

  it("returns EMPTY when the requested year does NOT match the source's year, even for the correct half", () => {
    const evidence = source(2026, ["p_1"]);
    const result = resolveReserveRoleParticipation(byPeriod(evidence, EMPTY_SOURCE), { key: "h1", year: 2027 });
    expect(result.technicianPersonIds.size).toBe(0);
    expect(result.supervisorPersonIds.size).toBe(0);
  });

  it("returns EMPTY when the source's year could not be parsed at all (null)", () => {
    const evidence = source(null, ["p_1"]);
    const result = resolveReserveRoleParticipation(byPeriod(evidence, EMPTY_SOURCE), { key: "h1", year: 2026 });
    expect(result.technicianPersonIds.size).toBe(0);
  });

  it("never reads the OTHER half's source, even if it happens to match the requested year", () => {
    const h1Evidence = source(2026, ["p_1"]);
    const h2Evidence = source(2026, ["p_2"]);
    const result = resolveReserveRoleParticipation(byPeriod(h1Evidence, h2Evidence), { key: "h1", year: 2026 });
    expect(result.technicianPersonIds.has("p_1")).toBe(true);
    expect(result.technicianPersonIds.has("p_2")).toBe(false);
  });
});
