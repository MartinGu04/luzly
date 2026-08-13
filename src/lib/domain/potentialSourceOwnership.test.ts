import { describe, expect, it } from "vitest";
import type { PotentialAllocation } from "./potentialAllocation";
import type { Person } from "./types";
import {
  classifyPotentialSourceOwnership,
  isManagerOwnedPotentialAllocation,
  scopeManagerPotentialAllocation,
} from "./potentialSourceOwnership";

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_x",
    name: "שם",
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

const MARTIN = person({ id: "p_martin", name: "מרטין גוסין" });
const EITAN = person({ id: "p_eitan", name: "איתן אבסה וסרמן" });
const ITAY = person({ id: "p_itay", name: "איתי כהן" });
const GIDON = person({ id: "p_gidon", name: "גדעון לוי" });
const MARK = person({ id: "p_mark", name: "מארק בר" });
const STEVEN = person({ id: "p_steven", name: "סטיבן ישראלי" });
const TUVIA = person({ id: "p_tuvia", name: "טוביה שמש" });
const DANIEL_A = person({ id: "p_daniel_a", name: "דניאל א" });
const DANIEL_B = person({ id: "p_daniel_b", name: "דניאל ב" });

const PERSONNEL = [MARTIN, EITAN, ITAY, GIDON, MARK, STEVEN, TUVIA, DANIEL_A, DANIEL_B];

describe("classifyPotentialSourceOwnership — team aliases (PR #16 §3/§8/§20)", () => {
  it.each(['תקש"ל', "תקש״ל", "תקשל", "תקשאס", 'תקש"אס', "תקש״אס"])(
    '"%s" is a team_alias regardless of quote style',
    (label) => {
      expect(classifyPotentialSourceOwnership(label, PERSONNEL)).toEqual({ kind: "team_alias" });
    },
  );
});

describe("classifyPotentialSourceOwnership — person sources, unique short first name (PR #16 §10/§20)", () => {
  it.each([
    ["מרטין", MARTIN],
    ["איתי", ITAY],
    ["גדעון", GIDON],
    ["מארק", MARK],
    ["סטיבן", STEVEN],
    ["טוביה", TUVIA],
  ] as const)('"%s" resolves to the unique matching person', (label, expected) => {
    expect(classifyPotentialSourceOwnership(label, PERSONNEL)).toEqual({
      kind: "team_person",
      personId: expected.id,
    });
  });
});

describe("classifyPotentialSourceOwnership — annotated person sources (PR #16 §12/§20)", () => {
  it('"מארק - הוקפץ מא" resolves via the leading token, annotation ignored', () => {
    expect(classifyPotentialSourceOwnership("מארק - הוקפץ מא", PERSONNEL)).toEqual({
      kind: "team_person",
      personId: MARK.id,
    });
  });

  it('"טוביה - החלפה סייבר" resolves to טוביה despite mentioning an external org later', () => {
    expect(classifyPotentialSourceOwnership("טוביה - החלפה סייבר", PERSONNEL)).toEqual({
      kind: "team_person",
      personId: TUVIA.id,
    });
  });

  it('"איתי החלפה סייבר" resolves to איתי despite mentioning an external org later', () => {
    expect(classifyPotentialSourceOwnership("איתי החלפה סייבר", PERSONNEL)).toEqual({
      kind: "team_person",
      personId: ITAY.id,
    });
  });
});

describe("classifyPotentialSourceOwnership — external organizational sources (PR #16 §4/§20)", () => {
  it.each([
    "איתן",
    "איתן א",
    "איתן צפון",
    "איתן מרכז",
    "איתן דרום",
    "רוקם",
    "מבצעים",
    "סייבר",
    'מ"א',
    'אמל"ח קצה',
    "אמלח קצה",
    "מנהלה",
  ])('"%s" is external', (label) => {
    expect(classifyPotentialSourceOwnership(label, PERSONNEL)).toEqual({ kind: "external" });
  });
});

describe("classifyPotentialSourceOwnership — external leading-token collision with a real person's first name (PR #16 §4/§11)", () => {
  it('bare "איתן" is external even though a real person\'s first name is איתן', () => {
    expect(classifyPotentialSourceOwnership("איתן", PERSONNEL)).toEqual({ kind: "external" });
    expect(classifyPotentialSourceOwnership("איתן", PERSONNEL)).not.toEqual({
      kind: "team_person",
      personId: EITAN.id,
    });
  });

  it('"איתן מרכז" is external, never resolved to איתן אבסה וסרמן', () => {
    expect(classifyPotentialSourceOwnership("איתן מרכז", PERSONNEL)).toEqual({ kind: "external" });
  });

  it('"איתן צפון" and "איתן דרום" are external too', () => {
    expect(classifyPotentialSourceOwnership("איתן צפון", PERSONNEL)).toEqual({ kind: "external" });
    expect(classifyPotentialSourceOwnership("איתן דרום", PERSONNEL)).toEqual({ kind: "external" });
  });

  it('"סייבר החלפה איתן" is external -- the label BEGINS with an external organization', () => {
    expect(classifyPotentialSourceOwnership("סייבר החלפה איתן", PERSONNEL)).toEqual({ kind: "external" });
  });

  it("an EXACT full-name match still resolves even though it shares a leading token with a known external label -- exact full-name evidence outranks a coincidental leading-word collision (only short-name SHORTHAND loses to external, per §11's title)", () => {
    expect(classifyPotentialSourceOwnership("איתן אבסה וסרמן", PERSONNEL)).toEqual({
      kind: "team_person",
      personId: EITAN.id,
    });
  });
});

describe("classifyPotentialSourceOwnership — ambiguous short first names never resolve (PR #16 §10/§21)", () => {
  it('"דניאל" does not resolve when two roster members share that first name', () => {
    expect(classifyPotentialSourceOwnership("דניאל", PERSONNEL)).toEqual({ kind: "unknown" });
  });

  it("an exact full unique name can still resolve even when the first name is ambiguous", () => {
    expect(classifyPotentialSourceOwnership("דניאל א", PERSONNEL)).toEqual({
      kind: "team_person",
      personId: DANIEL_A.id,
    });
    expect(classifyPotentialSourceOwnership("דניאל ב", PERSONNEL)).toEqual({
      kind: "team_person",
      personId: DANIEL_B.id,
    });
  });
});

describe("classifyPotentialSourceOwnership — unknown sources fail closed (PR #16 §13)", () => {
  it("a genuinely unrecognized label is unknown, never external or team-owned", () => {
    expect(classifyPotentialSourceOwnership("משהו שלא קיים בכלל", PERSONNEL)).toEqual({ kind: "unknown" });
  });

  it("blank/whitespace-only label is unknown", () => {
    expect(classifyPotentialSourceOwnership("   ", PERSONNEL)).toEqual({ kind: "unknown" });
    expect(classifyPotentialSourceOwnership("", PERSONNEL)).toEqual({ kind: "unknown" });
  });
});

describe("classifyPotentialSourceOwnership — no fuzzy matching", () => {
  it("a near-miss alias spelling does not canonicalize to a team alias", () => {
    expect(classifyPotentialSourceOwnership("תקשלה", PERSONNEL)).not.toEqual({ kind: "team_alias" });
  });

  it("a partial/substring person name never resolves", () => {
    expect(classifyPotentialSourceOwnership("מרט", PERSONNEL)).toEqual({ kind: "unknown" });
  });
});

describe("isManagerOwnedPotentialAllocation", () => {
  it("true for a team alias", () => {
    expect(isManagerOwnedPotentialAllocation('תקש"ל', PERSONNEL)).toBe(true);
  });

  it("true for a resolvable team person", () => {
    expect(isManagerOwnedPotentialAllocation("מרטין", PERSONNEL)).toBe(true);
  });

  it("false for an external source", () => {
    expect(isManagerOwnedPotentialAllocation("איתן מרכז", PERSONNEL)).toBe(false);
  });

  it("false for an unknown source", () => {
    expect(isManagerOwnedPotentialAllocation("משהו שלא קיים", PERSONNEL)).toBe(false);
  });
});

function allocation(overrides: Partial<PotentialAllocation> = {}): PotentialAllocation {
  return {
    date: "2026-08-13",
    dutyFamily: "evacuation_on_call",
    slot: null,
    sourceSlot: null,
    columnLabel: "כונן פינויים",
    sourceAllocationLabel: "מרטין",
    resolvedSourcePersonId: null,
    sourceSheet: 'פוטנציאל תקש"אס 1-6/2026',
    sourceCell: "Z1",
    ...overrides,
  };
}

describe("scopeManagerPotentialAllocation — PR #16 hardening (short/annotated person enrichment)", () => {
  it("team_alias: the allocation passes through unchanged", () => {
    const source = allocation({ sourceAllocationLabel: 'תקש"ל', resolvedSourcePersonId: null });
    expect(scopeManagerPotentialAllocation(source, PERSONNEL)).toEqual(source);
  });

  it("team_person via a SHORT name: resolvedSourcePersonId is enriched from null to the resolved person", () => {
    const source = allocation({ sourceAllocationLabel: "מרטין", resolvedSourcePersonId: null });
    const result = scopeManagerPotentialAllocation(source, PERSONNEL);
    expect(result?.resolvedSourcePersonId).toBe(MARTIN.id);
    // Every other field is preserved untouched.
    expect(result?.date).toBe(source.date);
    expect(result?.sourceAllocationLabel).toBe(source.sourceAllocationLabel);
  });

  it("team_person via an ANNOTATED name: resolvedSourcePersonId is enriched from the leading token", () => {
    const source = allocation({ sourceAllocationLabel: "מארק - הוקפץ מא", resolvedSourcePersonId: null });
    const result = scopeManagerPotentialAllocation(source, PERSONNEL);
    expect(result?.resolvedSourcePersonId).toBe(MARK.id);
  });

  it("team_person via an EXACT full name: resolvedSourcePersonId already matches, stays the same value", () => {
    const source = allocation({ sourceAllocationLabel: MARTIN.name, resolvedSourcePersonId: MARTIN.id });
    const result = scopeManagerPotentialAllocation(source, PERSONNEL);
    expect(result?.resolvedSourcePersonId).toBe(MARTIN.id);
  });

  it("external: returns null, regardless of any pre-existing resolvedSourcePersonId", () => {
    const source = allocation({ sourceAllocationLabel: "איתן מרכז", resolvedSourcePersonId: null });
    expect(scopeManagerPotentialAllocation(source, PERSONNEL)).toBeNull();
  });

  it("unknown: returns null", () => {
    const source = allocation({ sourceAllocationLabel: "משהו שלא קיים", resolvedSourcePersonId: null });
    expect(scopeManagerPotentialAllocation(source, PERSONNEL)).toBeNull();
  });

  it("a former team member no longer in personnel stays unresolved/excluded -- no special-casing required", () => {
    const source = allocation({ sourceAllocationLabel: "סטיבן", resolvedSourcePersonId: null });
    // PERSONNEL here still includes STEVEN; a roster WITHOUT him must exclude the allocation.
    const currentPersonnel = PERSONNEL.filter((p) => p.id !== STEVEN.id);
    expect(scopeManagerPotentialAllocation(source, currentPersonnel)).toBeNull();
  });

  it("never mutates the input allocation", () => {
    const source = allocation({ sourceAllocationLabel: "מרטין", resolvedSourcePersonId: null });
    const before = JSON.stringify(source);
    scopeManagerPotentialAllocation(source, PERSONNEL);
    expect(JSON.stringify(source)).toBe(before);
  });
});
