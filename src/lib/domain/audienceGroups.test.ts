import { describe, expect, it } from "vitest";
import {
  AUDIENCE_GROUP_KEYS,
  isAudienceGroupKey,
  personMatchesAnyAudienceGroup,
  personMatchesAudienceGroup,
  resolveAudienceGroupMembers,
  type AudienceGroupable,
} from "./audienceGroups";

function person(overrides: Partial<AudienceGroupable> & { id: string }): AudienceGroupable {
  return {
    personnelType: null,
    isSupervisor: false,
    isTechnician: false,
    ...overrides,
  };
}

describe("isAudienceGroupKey", () => {
  it("accepts every canonical group key", () => {
    for (const key of AUDIENCE_GROUP_KEYS) {
      expect(isAudienceGroupKey(key)).toBe(true);
    }
  });

  it("rejects an unclassified/other-style or arbitrary string", () => {
    expect(isAudienceGroupKey("unclassified")).toBe(false);
    expect(isAudienceGroupKey("other")).toBe(false);
    expect(isAudienceGroupKey("almash")).toBe(false);
    expect(isAudienceGroupKey("")).toBe(false);
  });
});

describe("personMatchesAudienceGroup -- service type", () => {
  it("matches קבע/סדיר/מילואים via classifyPersonnelType, never a raw string compare", () => {
    const permanent = person({ id: "p1", personnelType: "קבע" });
    const regular = person({ id: "p2", personnelType: "חובה" });
    const reserve = person({ id: "p3", personnelType: "מילואים" });

    expect(personMatchesAudienceGroup(permanent, "permanent")).toBe(true);
    expect(personMatchesAudienceGroup(permanent, "regular")).toBe(false);
    expect(personMatchesAudienceGroup(regular, "regular")).toBe(true);
    expect(personMatchesAudienceGroup(reserve, "reserve")).toBe(true);
    expect(personMatchesAudienceGroup(reserve, "permanent")).toBe(false);
  });

  it("an unclassified/unrecognized personnelType never matches any service-type group", () => {
    const unclassified = person({ id: "p1", personnelType: "משהו אחר" });
    expect(personMatchesAudienceGroup(unclassified, "permanent")).toBe(false);
    expect(personMatchesAudienceGroup(unclassified, "regular")).toBe(false);
    expect(personMatchesAudienceGroup(unclassified, "reserve")).toBe(false);
  });
});

describe("personMatchesAudienceGroup -- role groups", () => {
  it("matches supervisor/technician from the real capability flags, never a title guess", () => {
    const supervisor = person({ id: "p1", isSupervisor: true });
    const technician = person({ id: "p2", isTechnician: true });
    const both = person({ id: "p3", isSupervisor: true, isTechnician: true });

    expect(personMatchesAudienceGroup(supervisor, "supervisor")).toBe(true);
    expect(personMatchesAudienceGroup(supervisor, "technician")).toBe(false);
    expect(personMatchesAudienceGroup(technician, "technician")).toBe(true);
    expect(personMatchesAudienceGroup(both, "supervisor")).toBe(true);
    expect(personMatchesAudienceGroup(both, "technician")).toBe(true);
  });

  it("role groups are independent of service type -- a permanent supervisor still matches 'supervisor'", () => {
    const permanentSupervisor = person({ id: "p1", personnelType: "קבע", isSupervisor: true });
    expect(personMatchesAudienceGroup(permanentSupervisor, "supervisor")).toBe(true);
  });
});

describe("personMatchesAnyAudienceGroup -- union semantics", () => {
  it("matches when the person belongs to ANY selected group", () => {
    const regularTechnician = person({ id: "p1", personnelType: "חובה", isTechnician: true });
    expect(personMatchesAnyAudienceGroup(regularTechnician, ["permanent", "technician"])).toBe(true);
    expect(personMatchesAnyAudienceGroup(regularTechnician, ["permanent", "supervisor"])).toBe(false);
  });

  it("an empty group selection matches no one", () => {
    const anyone = person({ id: "p1", personnelType: "קבע", isSupervisor: true });
    expect(personMatchesAnyAudienceGroup(anyone, [])).toBe(false);
  });
});

describe("resolveAudienceGroupMembers", () => {
  it("unions multiple groups correctly and deduplicates a person matching more than one", () => {
    const supervisorReserve = person({ id: "p1", personnelType: "מילואים", isSupervisor: true });
    const regularOnly = person({ id: "p2", personnelType: "חובה" });
    const permanentOnly = person({ id: "p3", personnelType: "קבע" });

    const members = resolveAudienceGroupMembers([supervisorReserve, regularOnly, permanentOnly], ["reserve", "supervisor"]);

    expect(members.map((m) => m.id)).toEqual(["p1"]);
  });

  it("reflects the roster snapshot passed in -- a person added/removed between calls changes membership", () => {
    const before = [person({ id: "p1", personnelType: "קבע" })];
    const after = [person({ id: "p1", personnelType: "קבע" }), person({ id: "p2", personnelType: "קבע" })];

    expect(resolveAudienceGroupMembers(before, ["permanent"]).map((m) => m.id)).toEqual(["p1"]);
    expect(resolveAudienceGroupMembers(after, ["permanent"]).map((m) => m.id)).toEqual(["p1", "p2"]);
  });

  it("returns [] for an empty key list", () => {
    const roster = [person({ id: "p1", personnelType: "קבע" })];
    expect(resolveAudienceGroupMembers(roster, [])).toEqual([]);
  });
});
