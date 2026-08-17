import { describe, expect, it } from "vitest";
import type { SearchReadModel, SearchRosterPerson, SearchShiftEvent } from "@/lib/readModels/searchTypes";
import { parseSearchIntent } from "./parseSearchIntent";
import { resolveSearchIntent } from "./resolveSearchIntent";
import type { SearchIntent } from "./types";

const ME_ID = "p_me";
const COLLEAGUE_ID = "p_ilay";

function rosterPerson(overrides: Partial<SearchRosterPerson> = {}): SearchRosterPerson {
  return {
    id: COLLEAGUE_ID,
    name: "עילאי כהן",
    personnelType: "קבע",
    isSupervisor: true,
    isTechnician: false,
    ...overrides,
  };
}

function me(overrides: Partial<SearchRosterPerson> = {}): SearchRosterPerson {
  return {
    id: ME_ID,
    name: "דני בדיקה",
    personnelType: "חובה",
    isSupervisor: false,
    isTechnician: true,
    ...overrides,
  };
}

function shiftEvent(overrides: Partial<SearchShiftEvent> = {}): SearchShiftEvent {
  return {
    personId: COLLEAGUE_ID,
    date: "2026-08-12",
    period: "day",
    role: "supervisor",
    certainty: "confirmed",
    shadow: false,
    temporalState: "upcoming",
    ...overrides,
  };
}

function model(overrides: Partial<SearchReadModel> = {}): SearchReadModel {
  return {
    fetchedAt: "2026-08-12T08:00:00.000Z",
    localNow: { date: "2026-08-12", minuteOfDay: 600 },
    meId: ME_ID,
    roster: [me(), rosterPerson()],
    shiftEvents: [],
    ...overrides,
  };
}

describe("resolveSearchIntent — person results", () => {
  it("11. shows role and personnel-type labels", () => {
    const resolution = resolveSearchIntent({ kind: "person", query: "עילאי" }, model());
    expect(resolution.results).toHaveLength(1);
    const [result] = resolution.results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") {
      expect(result.roleLabel).toBe('אחמ"ש');
      expect(result.personnelTypeLabel).toBe("קבע");
    }
  });

  it("isSelf is false for a colleague result", () => {
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, model()).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") expect(result.isSelf).toBe(false);
  });

  it("12. shows currently-on-shift state only while actually current", () => {
    const withCurrent = model({
      shiftEvents: [shiftEvent({ date: "2026-08-12", period: "night", temporalState: "current" })],
    });
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, withCurrent).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") expect(result.currentShift).toEqual({ period: "night" });
  });

  it("no currentShift when the person has no active shift right now", () => {
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, model()).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") expect(result.currentShift).toBeNull();
  });

  it("13. shows the person's own next upcoming shift", () => {
    const withNext = model({
      shiftEvents: [
        shiftEvent({ date: "2026-08-20", period: "day", temporalState: "upcoming" }),
        shiftEvent({ date: "2026-08-25", period: "night", temporalState: "upcoming" }),
      ],
    });
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, withNext).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") expect(result.nextShift).toEqual({ date: "2026-08-20", period: "day" });
  });

  it("a person's own next shift (no shared shift) is shown informationally but is NEVER the navigation target -- /schedule is the VIEWER's own calendar, not this person's", () => {
    const withNextButNoShared = model({
      shiftEvents: [shiftEvent({ date: "2026-08-20", period: "day", temporalState: "upcoming" })],
    });
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, withNextButNoShared).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") {
      expect(result.nextShift).toEqual({ date: "2026-08-20", period: "day" });
      expect(result.href).toBeNull();
    }
  });

  it("14. shows the next SHARED shift with me when one exists", () => {
    const withShared = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-22", period: "night", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-22", period: "night", temporalState: "upcoming" }),
      ],
    });
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, withShared).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") expect(result.nextSharedShift).toEqual({ date: "2026-08-22", period: "night" });
  });

  it("a shared shift IS a valid navigation target -- that date exists on the viewer's own calendar", () => {
    const withShared = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-20", period: "day", temporalState: "upcoming" }), // own next shift, unshared
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-22", period: "night", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-22", period: "night", temporalState: "upcoming" }),
      ],
    });
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, withShared).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") {
      // href follows the SHARED date, never the person's own earlier, unshared next-shift date.
      expect(result.href).toBe("/schedule?date=2026-08-22");
    }
  });

  it("15. omits the shared-shift row entirely (never an empty placeholder) when none exists", () => {
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, model()).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") expect(result.nextSharedShift).toBeNull();
  });

  it("a person result with neither a next shift nor a shared shift has no href at all", () => {
    const [result] = resolveSearchIntent({ kind: "person", query: "עילאי" }, model()).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") expect(result.href).toBeNull();
  });

  it("never computes a shared shift against yourself, and flags the result as isSelf", () => {
    const withSelfShift = model({
      shiftEvents: [shiftEvent({ personId: ME_ID, date: "2026-08-12", period: "day", temporalState: "current" })],
    });
    const [result] = resolveSearchIntent({ kind: "person", query: "דני" }, withSelfShift).results;
    expect(result.kind).toBe("person");
    if (result.kind === "person") {
      expect(result.nextSharedShift).toBeNull();
      expect(result.isSelf).toBe(true);
    }
  });

  it("returns multiple person results, ranked exact > prefix > substring, never silently picking one", () => {
    const twoMatches = model({
      roster: [me(), rosterPerson(), rosterPerson({ id: "p_ilay2", name: "מיכאל עילאי" })],
    });
    const resolution = resolveSearchIntent({ kind: "person", query: "עילאי" }, twoMatches);
    expect(resolution.results).toHaveLength(2);
    // "עילאי כהן" (prefix match) ranks above "מיכאל עילאי" (substring-only match).
    expect(resolution.results[0].kind).toBe("person");
    if (resolution.results[0].kind === "person") expect(resolution.results[0].name).toBe("עילאי כהן");
  });

  it("no results and no specific empty message for a plain person query with zero matches", () => {
    const resolution = resolveSearchIntent({ kind: "person", query: "לאאאא" }, model());
    expect(resolution.results).toEqual([]);
    expect(resolution.emptyMessage).toBeNull();
  });
});

const SELF_REF = { kind: "self" } as const;
function queryRef(text: string) {
  return { kind: "query", text } as const;
}

describe("resolveSearchIntent — shared shift (self + person)", () => {
  it("16. finds the correct next common shift between me and the named person", () => {
    const withShared = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עילאי"), raw: "" },
      withShared,
    );
    expect(resolution.results).toHaveLength(1);
    const [result] = resolution.results;
    expect(result.kind).toBe("shared_shift");
    if (result.kind === "shared_shift") {
      expect(result.personA).toEqual({ personId: ME_ID, name: "דני בדיקה", isSelf: true });
      expect(result.personB).toEqual({ personId: COLLEAGUE_ID, name: "עילאי כהן", isSelf: false });
      expect(result.shifts).toEqual([{ date: "2026-08-15", period: "day" }]);
      expect(result.href).toBe("/schedule?date=2026-08-15");
    }
  });

  it("17. does NOT treat a day shift for one and a night shift for the other on the SAME date as together", () => {
    const differentPeriods = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "night", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עילאי"), raw: "" },
      differentPeriods,
    );
    expect(resolution.results).toEqual([]);
    expect(resolution.emptyMessage).not.toBeNull();
  });

  it("18. finds a shared shift correctly across a calendar-date/month boundary", () => {
    const acrossBoundary = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-09-01", period: "night", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-09-01", period: "night", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עילאי"), raw: "" },
      acrossBoundary,
    );
    expect(resolution.results[0].kind).toBe("shared_shift");
    if (resolution.results[0].kind === "shared_shift") {
      expect(resolution.results[0].shifts).toEqual([{ date: "2026-09-01", period: "night" }]);
    }
  });

  it("19. an explicit shared-shift question with no answer gets a tasteful specific empty message naming the resolved person", () => {
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עילאי"), raw: "" },
      model(),
    );
    expect(resolution.results).toEqual([]);
    expect(resolution.emptyMessage).toContain("עילאי");
    expect(resolution.emptyMessage).toMatch(/^אין לכם משמרת משותפת בתקופה הזמינה עם/);
  });

  it("an unmatched name gets a distinct 'no such person' message", () => {
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("זזזזז"), raw: "" },
      model(),
    );
    expect(resolution.results).toEqual([]);
    expect(resolution.emptyMessage).toContain("זזזזז");
  });

  it("shows only the next few shared shifts, soonest first, never an unbounded list", () => {
    const manyShared = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-13", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-13", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-20", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-20", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-25", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-25", period: "day", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עילאי"), raw: "" },
      manyShared,
    );
    expect(resolution.results[0].kind).toBe("shared_shift");
    if (resolution.results[0].kind === "shared_shift") {
      expect(resolution.results[0].shifts.length).toBeLessThanOrEqual(3);
      expect(resolution.results[0].shifts[0]).toEqual({ date: "2026-08-13", period: "day" });
    }
  });

  it("end-to-end: 'מתי אני ועילאי יחד' parses and resolves to the same shared-shift result", () => {
    const withShared = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const intent = parseSearchIntent("מתי אני ועילאי יחד");
    const resolution = resolveSearchIntent(intent, withShared);
    expect(resolution.results[0].kind).toBe("shared_shift");
  });

  it("the reversed phrasing 'מתי עילאי ואני ביחד' (person named first) resolves to the identical shared-shift result", () => {
    const withShared = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const intent = parseSearchIntent("מתי עילאי ואני ביחד");
    expect(intent).toEqual({
      kind: "shared_shift",
      personA: queryRef("עילאי"),
      personB: SELF_REF,
      raw: "מתי עילאי ואני ביחד",
    });
    const resolution = resolveSearchIntent(intent, withShared);
    expect(resolution.results[0].kind).toBe("shared_shift");
    if (resolution.results[0].kind === "shared_shift") {
      // Even though personA is the "עילאי" query and personB is self in the
      // parsed intent, the resolved result always exposes isSelf on
      // whichever side actually IS the searching user.
      expect(resolution.results[0].personA.isSelf).toBe(false);
      expect(resolution.results[0].personB.isSelf).toBe(true);
    }
  });
});

describe("resolveSearchIntent — shared shift (arbitrary person + person)", () => {
  const OTHER_ID = "p_toviya";
  function otherPerson(overrides: Partial<SearchRosterPerson> = {}): SearchRosterPerson {
    return {
      id: OTHER_ID,
      name: "טוביה מור",
      personnelType: "סדיר",
      isSupervisor: false,
      isTechnician: true,
      ...overrides,
    };
  }

  it("finds the shared shift between two roster people, neither of them the searching user", () => {
    const withOther = model({
      roster: [me(), rosterPerson(), otherPerson()],
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: OTHER_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: queryRef("טוביה"), personB: queryRef("עילאי"), raw: "" },
      withOther,
    );
    expect(resolution.results).toHaveLength(1);
    const [result] = resolution.results;
    expect(result.kind).toBe("shared_shift");
    if (result.kind === "shared_shift") {
      expect(result.personA).toEqual({ personId: OTHER_ID, name: "טוביה מור", isSelf: false });
      expect(result.personB).toEqual({ personId: COLLEAGUE_ID, name: "עילאי כהן", isSelf: false });
      expect(result.shifts).toEqual([{ date: "2026-08-15", period: "day" }]);
    }
  });

  it("an arbitrary other+other pair NEVER gets a /schedule href, even with a shared shift found -- /schedule is only ever the VIEWER's own calendar", () => {
    const withOther = model({
      roster: [me(), rosterPerson(), otherPerson()],
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: OTHER_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: queryRef("טוביה"), personB: queryRef("עילאי"), raw: "" },
      withOther,
    );
    expect(resolution.results[0].kind).toBe("shared_shift");
    if (resolution.results[0].kind === "shared_shift") {
      expect(resolution.results[0].href).toBeNull();
    }
  });

  it("a self+other pair keeps the /schedule?date= href, unaffected by the other+other rule", () => {
    const withShared = model({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עילאי"), raw: "" },
      withShared,
    );
    expect(resolution.results[0].kind).toBe("shared_shift");
    if (resolution.results[0].kind === "shared_shift") {
      expect(resolution.results[0].href).toBe("/schedule?date=2026-08-15");
    }
  });

  it("no-shared-shift copy for an other+other pair names BOTH resolved people, and never claims 'never'", () => {
    const withOther = model({ roster: [me(), rosterPerson(), otherPerson()] });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: queryRef("טוביה"), personB: queryRef("עילאי"), raw: "" },
      withOther,
    );
    expect(resolution.results).toEqual([]);
    expect(resolution.emptyMessage).toBe("לא נמצאה משמרת משותפת בתקופה הזמינה עבור טוביה מור ועילאי כהן.");
  });

  it("no-shared-shift copy for a self+other pair matches the required exact wording", () => {
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עילאי"), raw: "" },
      model(),
    );
    expect(resolution.emptyMessage).toBe("אין לכם משמרת משותפת בתקופה הזמינה עם עילאי כהן.");
  });

  it("a self-reference resolving on the 'other' side (query text matching the searching user's own name) fails gracefully instead of a meaningless self-vs-self result", () => {
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("דני"), raw: "" },
      model(),
    );
    expect(resolution.results).toEqual([]);
    expect(resolution.emptyMessage).not.toBeNull();
    expect(resolution.emptyMessage).not.toContain("undefined");
  });
});

describe("resolveSearchIntent — shared shift ambiguous-name disambiguation", () => {
  const ILAY2_ID = "p_ilay2";
  function ilay2(overrides: Partial<SearchRosterPerson> = {}): SearchRosterPerson {
    return {
      id: ILAY2_ID,
      name: "עילי מזרחי",
      personnelType: "מילואים",
      isSupervisor: false,
      isTechnician: true,
      ...overrides,
    };
  }

  function twoMatchesModel(overrides: Partial<SearchReadModel> = {}): SearchReadModel {
    return model({ roster: [me(), rosterPerson(), ilay2()], ...overrides });
  }

  it("an ambiguous personB query never silently picks a candidate -- it surfaces every match as a disambiguation choice", () => {
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עיל"), raw: "" },
      twoMatchesModel(),
    );
    expect(resolution.results).toHaveLength(2);
    expect(resolution.results.every((result) => result.kind === "shared_shift_disambiguation")).toBe(true);
    const names = resolution.results.map((result) =>
      result.kind === "shared_shift_disambiguation" ? result.name : null,
    );
    expect(names.sort()).toEqual(["עילאי כהן", "עילי מזרחי"].sort());
  });

  it("disambiguation candidates are surfaced regardless of whether they happen to share a shift with anyone -- the schedule is NEVER used to disambiguate", () => {
    // Only עילאי (not עילי) has a shared shift with me -- the old
    // implementation silently filtered ambiguous candidates down to only
    // those with a shared shift, which is exactly the bug this replaces.
    const onlyOneHasSharedShift = twoMatchesModel({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עיל"), raw: "" },
      onlyOneHasSharedShift,
    );
    expect(resolution.results).toHaveLength(2);
    expect(resolution.results.every((result) => result.kind === "shared_shift_disambiguation")).toBe(true);
  });

  it("each disambiguation candidate carries role and personnel-group labels", () => {
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עיל"), raw: "" },
      twoMatchesModel(),
    );
    const ilay = resolution.results.find(
      (result) => result.kind === "shared_shift_disambiguation" && result.personId === COLLEAGUE_ID,
    );
    expect(ilay).toBeDefined();
    if (ilay?.kind === "shared_shift_disambiguation") {
      expect(ilay.roleLabel).toBe('אחמ"ש');
      expect(ilay.personnelTypeLabel).toBe("קבע");
    }
  });

  it("disambiguation results carry no href -- selecting one refines the query in place, never navigates", () => {
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עיל"), raw: "" },
      twoMatchesModel(),
    );
    expect(resolution.results.every((result) => result.href === null)).toBe(true);
  });

  it("supplying an override for the ambiguous side resolves straight to the final shared-shift result", () => {
    const withShared = twoMatchesModel({
      shiftEvents: [
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עיל"), raw: "" },
      withShared,
      { personB: COLLEAGUE_ID },
    );
    expect(resolution.results).toHaveLength(1);
    expect(resolution.results[0].kind).toBe("shared_shift");
  });

  it("when BOTH sides are ambiguous, they resolve one at a time, deterministically A before B", () => {
    const bothAmbiguousModel = model({
      roster: [me(), rosterPerson(), ilay2(), { id: "p_dan1", name: "דן לוי", personnelType: "קבע", isSupervisor: false, isTechnician: true }, { id: "p_dan2", name: "דן כהן", personnelType: "חובה", isSupervisor: false, isTechnician: true }],
    });

    // A ("דן") is ambiguous -- surfaced first, B's ambiguity not yet visible.
    const firstPass = resolveSearchIntent(
      { kind: "shared_shift", personA: queryRef("דן"), personB: queryRef("עיל"), raw: "" },
      bothAmbiguousModel,
    );
    expect(firstPass.results).toHaveLength(2);
    expect(firstPass.results.every((r) => r.kind === "shared_shift_disambiguation" && r.side === "A")).toBe(true);

    // Once A is resolved via override, B's ambiguity becomes visible.
    const secondPass = resolveSearchIntent(
      { kind: "shared_shift", personA: queryRef("דן"), personB: queryRef("עיל"), raw: "" },
      bothAmbiguousModel,
      { personA: "p_dan1" },
    );
    expect(secondPass.results).toHaveLength(2);
    expect(secondPass.results.every((r) => r.kind === "shared_shift_disambiguation" && r.side === "B")).toBe(true);

    // Once both are resolved via overrides, resolution proceeds to a final
    // answer (no shift data in this fixture, so a specific empty message --
    // but crucially, no more disambiguation).
    const thirdPass = resolveSearchIntent(
      { kind: "shared_shift", personA: queryRef("דן"), personB: queryRef("עיל"), raw: "" },
      bothAmbiguousModel,
      { personA: "p_dan1", personB: COLLEAGUE_ID },
    );
    expect(thirdPass.results.every((r) => r.kind !== "shared_shift_disambiguation")).toBe(true);
    expect(thirdPass.emptyMessage).not.toBeNull();
  });

  it("an exact/unique full name proceeds directly without any disambiguation, even when a partial match would have been ambiguous", () => {
    const resolution = resolveSearchIntent(
      { kind: "shared_shift", personA: SELF_REF, personB: queryRef("עילאי כהן"), raw: "" },
      twoMatchesModel(),
    );
    expect(resolution.results.every((result) => result.kind !== "shared_shift_disambiguation")).toBe(true);
  });
});

describe("resolveSearchIntent — מי איתי", () => {
  it("20. returns the actual same-shift roster (reusing the same date+period equality every other staffing lookup uses)", () => {
    const withRoster = model({
      shiftEvents: [
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", role: "technician", temporalState: "upcoming" }),
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
      ],
    });
    const intent: SearchIntent = {
      kind: "with_me",
      date: { kind: "explicit", day: 15, month: 8 },
      period: null,
      raw: "",
    };
    const resolution = resolveSearchIntent(intent, withRoster);
    expect(resolution.results).toHaveLength(1);
    const [result] = resolution.results;
    expect(result.kind).toBe("with_me");
    if (result.kind === "with_me") {
      expect(result.date).toBe("2026-08-15");
      expect(result.people).toEqual([
        { personId: COLLEAGUE_ID, name: "עילאי כהן", role: "supervisor", shadow: false },
      ]);
    }
  });

  it("21. never returns arbitrary people from an unrelated shift when the user has no shift that day", () => {
    const noShiftThatDay = model({
      shiftEvents: [shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" })],
    });
    const intent: SearchIntent = {
      kind: "with_me",
      date: { kind: "explicit", day: 15, month: 8 },
      period: null,
      raw: "",
    };
    const resolution = resolveSearchIntent(intent, noShiftThatDay);
    expect(resolution.results).toEqual([]);
    expect(resolution.emptyMessage).not.toBeNull();
  });

  it("22. a period-specific מי איתי query resolves the correct shift, not a different-period shift on the same date", () => {
    const bothPeriods = model({
      shiftEvents: [
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: ME_ID, date: "2026-08-15", period: "night", temporalState: "upcoming" }),
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-15", period: "day", temporalState: "upcoming" }),
        shiftEvent({ personId: "p_other", date: "2026-08-15", period: "night", temporalState: "upcoming" }),
      ],
      roster: [me(), rosterPerson(), rosterPerson({ id: "p_other", name: "רוני שדה" })],
    });
    const intent: SearchIntent = {
      kind: "with_me",
      date: { kind: "explicit", day: 15, month: 8 },
      period: "night",
      raw: "",
    };
    const resolution = resolveSearchIntent(intent, bothPeriods);
    expect(resolution.results).toHaveLength(1);
    const [result] = resolution.results;
    expect(result.kind).toBe("with_me");
    if (result.kind === "with_me") {
      expect(result.period).toBe("night");
      expect(result.people.map((person) => person.name)).toEqual(["רוני שדה"]);
    }
  });

  it("bare 'מי איתי' with no date resolves against TODAY", () => {
    const todayRoster = model({
      localNow: { date: "2026-08-12", minuteOfDay: 600 },
      shiftEvents: [
        shiftEvent({ personId: ME_ID, date: "2026-08-12", period: "day", temporalState: "current" }),
        shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-12", period: "day", temporalState: "current" }),
      ],
    });
    const resolution = resolveSearchIntent({ kind: "with_me", date: null, period: null, raw: "" }, todayRoster);
    expect(resolution.results).toHaveLength(1);
    expect(resolution.results[0].kind).toBe("with_me");
    if (resolution.results[0].kind === "with_me") expect(resolution.results[0].date).toBe("2026-08-12");
  });

  it("explicit no-shift answer matches the tasteful 'אין לך משמרת' wording for an explicit question", () => {
    const resolution = resolveSearchIntent(
      { kind: "with_me", date: { kind: "explicit", day: 22, month: 8 }, period: null, raw: "" },
      model(),
    );
    expect(resolution.emptyMessage).toMatch(/אין לך משמרת/);
  });
});

describe("resolveSearchIntent — date and shift navigation", () => {
  it("resolves a bare date intent to a navigable /schedule?date= result", () => {
    const resolution = resolveSearchIntent(
      { kind: "date", date: { kind: "explicit", day: 19, month: 8 }, raw: "19.8" },
      model(),
    );
    expect(resolution.results).toHaveLength(1);
    const [result] = resolution.results;
    expect(result.kind).toBe("date");
    if (result.kind === "date") {
      expect(result.date).toBe("2026-08-19");
      expect(result.href).toBe("/schedule?date=2026-08-19");
    }
  });

  it("an unresolvable date (invalid day/month combo) yields a helpful message, not a crash", () => {
    const resolution = resolveSearchIntent(
      { kind: "date", date: { kind: "explicit", day: 31, month: 4 }, raw: "31.4" },
      model(),
    );
    expect(resolution.results).toEqual([]);
    expect(resolution.emptyMessage).not.toBeNull();
  });

  it("resolves a shift+date intent with the shift's staffing", () => {
    const withStaffing = model({
      shiftEvents: [shiftEvent({ personId: COLLEAGUE_ID, date: "2026-08-19", period: "night", temporalState: "upcoming" })],
    });
    const resolution = resolveSearchIntent(
      { kind: "shift", date: { kind: "explicit", day: 19, month: 8 }, period: "night", raw: "" },
      withStaffing,
    );
    expect(resolution.results).toHaveLength(1);
    const [result] = resolution.results;
    expect(result.kind).toBe("shift");
    if (result.kind === "shift") {
      expect(result.date).toBe("2026-08-19");
      expect(result.period).toBe("night");
      expect(result.people.map((person) => person.name)).toEqual(["עילאי כהן"]);
      expect(result.href).toBe("/schedule?date=2026-08-19");
    }
  });
});
