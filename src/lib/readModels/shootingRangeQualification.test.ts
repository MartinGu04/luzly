import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const getRequestAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();
const getCompletionsForPersonIds = vi.fn();
const getPlannedOccurrencesForPersonIds = vi.fn();

vi.mock("@/lib/auth/getRequestAuthenticatedIdentity", () => ({ getRequestAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));
vi.mock("@/lib/shootingRanges/store", () => ({ getCompletionsForPersonIds, getPlannedOccurrencesForPersonIds }));

const {
  loadShootingRangeQualification,
  selectSheetBaselineForPerson,
  selectRelevanceRecordForPerson,
  buildWeaponQualificationIndex,
} = await import("./shootingRangeQualification");

function personnelSheet(rows: string[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}

function shootingRangesSheet(rows: (string | number)[][]): RawSheet {
  return { name: "מטווחים", values: rows };
}

// Regular-service (חובה) + טכנאי by default -- מטווחים is scoped to
// regular personnel who are also אחמ"ש/טכנאי (see the dedicated
// "personnel-type eligibility" describe block below), so every
// pre-existing "ok" test needs an explicit eligible row.
const PERSONNEL_ROWS: string[][] = [
  ["שם", "מייל", 'סוג כ"א', "טכנאי"],
  ["דני בדיקה", "dani@example.invalid", "חובה", "TRUE"],
];

function snapshot(shootingRangesRows: (string | number)[][] = []) {
  return {
    fetchedAt: "2026-08-25T08:00:00.000Z",
    sheets: [personnelSheet(PERSONNEL_ROWS), shootingRangesSheet(shootingRangesRows)],
  };
}

describe("loadShootingRangeQualification", () => {
  beforeEach(() => {
    getRequestAuthenticatedIdentity.mockReset();
    getWorkbookSnapshot.mockReset();
    getJerusalemLocalNow.mockReset();
    getCompletionsForPersonIds.mockReset();
    getPlannedOccurrencesForPersonIds.mockReset();

    getJerusalemLocalNow.mockReturnValue({ date: "2026-08-25", minuteOfDay: 600 });
    getCompletionsForPersonIds.mockResolvedValue([]);
    getPlannedOccurrencesForPersonIds.mockResolvedValue([]);
  });

  it("returns unauthenticated without ever fetching the workbook or the app-owned tables", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });

    const result = await loadShootingRangeQualification();

    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
    expect(getCompletionsForPersonIds).not.toHaveBeenCalled();
  });

  it("returns missing_email without fetching anything", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });

    const result = await loadShootingRangeQualification();

    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("fetches personnel + מטווחים as one batch, resolves identity by email, and returns unmapped for an email absent from כ״א", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "ghost@example.invalid", avatarUrl: null });
    getWorkbookSnapshot.mockResolvedValue(snapshot());

    const result = await loadShootingRangeQualification();

    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel", "shootingRanges"]);
    expect(result).toEqual({ status: "unmapped", email: "ghost@example.invalid" });
    // The identity check fails BEFORE any app-owned table is ever read for this caller.
    expect(getCompletionsForPersonIds).not.toHaveBeenCalled();
  });

  it("returns ambiguous_identity when the email matches more than one כ״א record -- fails closed, never a first-match guess", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-25T08:00:00.000Z",
      sheets: [
        personnelSheet([
          ["שם", "מייל"],
          ["דני בדיקה", "dani@example.invalid"],
          ["דני בדיקה 2", "dani@example.invalid"],
        ]),
        shootingRangesSheet([]),
      ],
    });

    const result = await loadShootingRangeQualification();

    expect(result).toEqual({ status: "ambiguous_identity" });
  });

  it("A. loads the Google Sheet baseline for the identified person -- a genuinely past-dated מטווחים row becomes the qualification baseline", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: "https://photo" });
    getWorkbookSnapshot.mockResolvedValue(
      snapshot([
        ["שם", "תאריך ביצוע מטווח"],
        ["דני בדיקה", "29/06/2026"],
      ]),
    );

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.person.name).toBe("דני בדיקה");
    expect(result.avatarUrl).toBe("https://photo");
    expect(result.model.baselineDate).toBe("2026-06-29");
    expect(result.model.baselineSource).toBe("sheet");
    expect(result.model.expiryDate).toBe("2026-12-29");
    // Requests this person's own history/planned rows, keyed by their resolved stable id -- never every person's.
    expect(getCompletionsForPersonIds).toHaveBeenCalledWith([expect.any(String)]);
    expect(getPlannedOccurrencesForPersonIds).toHaveBeenCalledWith([expect.any(String)]);
  });

  it("a FUTURE-dated מטווחים row is never treated as the sheet baseline (it's a planned occurrence's concern, not this loader's)", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
    getWorkbookSnapshot.mockResolvedValue(
      snapshot([
        ["שם", "תאריך ביצוע מטווח"],
        ["דני בדיקה", "01/01/2030"],
      ]),
    );

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.baselineDate).toBeNull();
  });

  it("B. an approved app-owned completion (from the store) unconditionally wins over the sheet baseline", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
    getWorkbookSnapshot.mockResolvedValue(
      snapshot([
        ["שם", "תאריך ביצוע מטווח"],
        ["דני בדיקה", "01/01/2026"],
      ]),
    );
    getCompletionsForPersonIds.mockResolvedValue([
      {
        id: "c1",
        personId: "p_whatever",
        performedOn: "2026-08-01",
        source: "self_report",
        status: "approved",
        notes: null,
        submittedByPersonId: "u1",
        submittedByPersonName: "דני בדיקה",
        approvedByPersonId: "mgr1",
        approvedByPersonName: "מנהל",
        approvedAt: "2026-08-02T00:00:00.000Z",
        linkedPlannedDate: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ]);

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.baselineDate).toBe("2026-08-01");
    expect(result.model.baselineSource).toBe("app");
  });

  it("degrades gracefully (never throws) when the מטווחים sheet has no recognizable header row at all -- baseline stays null, not a crash", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
    getWorkbookSnapshot.mockResolvedValue(snapshot([["הערות כלליות"], ["טקסט חופשי"]]));

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.baselineDate).toBeNull();
    expect(result.model.status).toBe("none");
  });

  it("throws when the workbook snapshot is missing the מטווחים sheet entirely -- a real configuration problem, never silently ignored", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
    getWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-25T08:00:00.000Z", sheets: [personnelSheet(PERSONNEL_ROWS)] });

    await expect(loadShootingRangeQualification()).rejects.toThrow(/מטווחים/);
  });

  describe("eligibility (regular/permanent-service AND אחמ\"ש/טכנאי)", () => {
    function personnelRowsWithType(type: string): string[][] {
      return [
        ["שם", "מייל", 'סוג כ"א'],
        ["דני בדיקה", "dani@example.invalid", type],
      ];
    }

    it.each([
      ["reserve (מילואים)", "מילואים"],
      ["unclassified/unrecognized type", "משהו אחר"],
    ])("returns not_applicable for %s -- never builds a model, never touches the app-owned tables", async (_label, type) => {
      getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: "https://photo" });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [personnelSheet(personnelRowsWithType(type)), shootingRangesSheet([
          ["שם", "תאריך ביצוע מטווח"],
          ["דני בדיקה", "01/01/2026"],
        ])],
      });

      const result = await loadShootingRangeQualification();

      expect(result.status).toBe("not_applicable");
      if (result.status !== "not_applicable") throw new Error("unreachable");
      // Identity is still carried (e.g. so the page can still show a manager-overview link for a non-regular manager).
      expect(result.person.name).toBe("דני בדיקה");
      expect(result.avatarUrl).toBe("https://photo");
      expect(getCompletionsForPersonIds).not.toHaveBeenCalled();
      expect(getPlannedOccurrencesForPersonIds).not.toHaveBeenCalled();
    });

    it("a row for a non-regular person in the מטווחים sheet never makes them eligible -- eligibility is checked BEFORE the sheet is even parsed", async () => {
      getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [
          personnelSheet(personnelRowsWithType("מילואים")),
          shootingRangesSheet([
            ["שם", "תאריך ביצוע מטווח"],
            ["דני בדיקה", "01/01/2026"],
          ]),
        ],
      });

      const result = await loadShootingRangeQualification();

      expect(result).toEqual({ status: "not_applicable", person: expect.objectContaining({ name: "דני בדיקה" }), avatarUrl: null });
    });

    it("a regular (חובה) + טכנאי person still proceeds to a full ok result", async () => {
      getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
      getWorkbookSnapshot.mockResolvedValue(snapshot());

      const result = await loadShootingRangeQualification();

      expect(result.status).toBe("ok");
    });

    it("a regular (חובה) person who is NEITHER אחמ\"ש NOR טכנאי is not_applicable -- the role half of the rule, not just the service half", async () => {
      getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [personnelSheet(personnelRowsWithType("חובה")), shootingRangesSheet([])],
      });

      const result = await loadShootingRangeQualification();

      expect(result.status).toBe("not_applicable");
    });

    it("a regular (חובה) + אחמ\"ש person is eligible too, not just טכנאי", async () => {
      getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [
          personnelSheet([
            ["שם", "מייל", 'סוג כ"א', 'אחמ"ש'],
            ["דני בדיקה", "dani@example.invalid", "חובה", "TRUE"],
          ]),
          shootingRangesSheet([]),
        ],
      });

      const result = await loadShootingRangeQualification();

      expect(result.status).toBe("ok");
    });

    it("a permanent (קבע) + טכנאי person is eligible too, via the same rule as regular -- proceeds to a full ok result with the same qualification model", async () => {
      getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [
          personnelSheet([
            ["שם", "מייל", 'סוג כ"א', "טכנאי"],
            ["דני בדיקה", "dani@example.invalid", "קבע", "TRUE"],
          ]),
          shootingRangesSheet([
            ["שם", "תאריך ביצוע מטווח"],
            ["דני בדיקה", "29/06/2026"],
          ]),
        ],
      });

      const result = await loadShootingRangeQualification();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.baselineDate).toBe("2026-06-29");
      expect(result.model.expiryDate).toBe("2026-12-29");
    });

    it("a permanent (קבע) person who is NEITHER אחמ\"ש NOR טכנאי is not_applicable, same as a regular person in neither role", async () => {
      getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [personnelSheet(personnelRowsWithType("קבע")), shootingRangesSheet([])],
      });

      const result = await loadShootingRangeQualification();

      expect(result.status).toBe("not_applicable");
    });
  });
});

describe("loadShootingRangeQualification -- רלוונטיות / סיבה / הערה (real Sheet headers)", () => {
  beforeEach(() => {
    getRequestAuthenticatedIdentity.mockReset();
    getWorkbookSnapshot.mockReset();
    getJerusalemLocalNow.mockReset();
    getCompletionsForPersonIds.mockReset();
    getPlannedOccurrencesForPersonIds.mockReset();

    getJerusalemLocalNow.mockReturnValue({ date: "2026-08-25", minuteOfDay: 600 });
    getCompletionsForPersonIds.mockResolvedValue([]);
    getPlannedOccurrencesForPersonIds.mockResolvedValue([]);
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
  });

  it("A. רלוונטי + valid completion date -> normal qualification state", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      snapshot([
        ["שם", "תאריך ביצוע מטווחים", "תאריך תפוגה", "סטטוס", "רלוונטיות", "סיבה / הערה"],
        ["דני בדיקה", "29/06/2026", "29/12/2026", "תקף", "רלוונטי", ""],
      ]),
    );

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.status).not.toBe("not_relevant");
    expect(result.model.baselineDate).toBe("2026-06-29");
    expect(result.model.notRelevantReason).toBeNull();
  });

  it("B. רלוונטי + no completion date -> אין מידע כשירות ('none')", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      snapshot([
        ["שם", "תאריך ביצוע מטווחים", "רלוונטיות", "סיבה / הערה"],
        ["דני בדיקה", "", "רלוונטי", ""],
      ]),
    );

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.status).toBe("none");
    expect(result.model.baselineDate).toBeNull();
  });

  it("C. לא רלוונטי + reason -> dedicated not_relevant state + reason", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      snapshot([
        ["שם", "תאריך ביצוע מטווחים", "רלוונטיות", "סיבה / הערה"],
        ["דני בדיקה", "", "לא רלוונטי", "פטור שמירות"],
      ]),
    );

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.status).toBe("not_relevant");
    expect(result.model.notRelevantReason).toBe("פטור שמירות");
  });

  it("C. לא רלוונטי + a STALE completion date -- must still render as not_relevant, never qualified/expired off the stale date (spec's own example)", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      snapshot([
        ["שם", "תאריך ביצוע מטווחים", "תאריך תפוגה", "סטטוס", "רלוונטיות", "סיבה / הערה"],
        ["דני בדיקה", "23/02/2026", "23/08/2026", "פג תוקף", "לא רלוונטי", "פטור שמירות"],
      ]),
    );

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.status).toBe("not_relevant");
    expect(result.model.notRelevantReason).toBe("פטור שמירות");
    expect(result.model.baselineDate).toBeNull();
    expect(result.model.expiryDate).toBeNull();
  });

  it("לא רלוונטי without a reason still works cleanly -- reason is optional", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      snapshot([
        ["שם", "תאריך ביצוע מטווחים", "רלוונטיות"],
        ["דני בדיקה", "", "לא רלוונטי"],
      ]),
    );

    const result = await loadShootingRangeQualification();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.status).toBe("not_relevant");
    expect(result.model.notRelevantReason).toBeNull();
  });
});

describe("selectSheetBaselineForPerson", () => {
  it("picks the LATEST past-or-today row for the person, ignoring other people and future dates", () => {
    const records = [
      { sourceName: "a", resolvedPersonId: "p1", performedOn: "2026-01-01", sourceSheet: "מטווחים", sourceCell: "A2" },
      { sourceName: "a", resolvedPersonId: "p1", performedOn: "2026-06-01", sourceSheet: "מטווחים", sourceCell: "A3" },
      { sourceName: "a", resolvedPersonId: "p1", performedOn: "2030-01-01", sourceSheet: "מטווחים", sourceCell: "A4" },
      { sourceName: "b", resolvedPersonId: "p2", performedOn: "2026-08-01", sourceSheet: "מטווחים", sourceCell: "A5" },
    ];

    const result = selectSheetBaselineForPerson(records, "p1", "2026-08-25");

    expect(result?.performedOn).toBe("2026-06-01");
  });

  it("returns null when the person has no resolved row at all", () => {
    expect(selectSheetBaselineForPerson([], "p1", "2026-08-25")).toBeNull();
  });
});

describe("selectRelevanceRecordForPerson", () => {
  it("returns the LAST matching row in sheet order (later entry wins), ignoring other people", () => {
    const records = [
      { sourceName: "a", resolvedPersonId: "p1", relevance: "relevant" as const, reason: null, sourceSheet: "מטווחים", sourceCell: "E2" },
      { sourceName: "b", resolvedPersonId: "p2", relevance: "not_relevant" as const, reason: null, sourceSheet: "מטווחים", sourceCell: "E3" },
      { sourceName: "a", resolvedPersonId: "p1", relevance: "not_relevant" as const, reason: "פטור שמירות", sourceSheet: "מטווחים", sourceCell: "E4" },
    ];

    const result = selectRelevanceRecordForPerson(records, "p1");

    expect(result).toEqual({
      sourceName: "a",
      resolvedPersonId: "p1",
      relevance: "not_relevant",
      reason: "פטור שמירות",
      sourceSheet: "מטווחים",
      sourceCell: "E4",
    });
  });

  it("returns null when the person has no explicit רלוונטיות row at all", () => {
    expect(selectRelevanceRecordForPerson([], "p1")).toBeNull();
  });
});

describe("buildWeaponQualificationIndex -- activity-driven, deliberately NOT scoped by isEligibleForShootingRanges", () => {
  function makePerson(overrides: Partial<Person> = {}): Person {
    return {
      id: "p1",
      name: "בדיקה",
      email: null,
      isManager: false,
      isTechnician: false,
      isSupervisor: false,
      personnelType: "קבע",
      ...overrides,
    };
  }

  it("includes a permanent (קבע) person who is neither אחמ\"ש nor טכנאי -- never pre-filtered by role/service category", () => {
    const person = makePerson({ id: "p_perm_ns", personnelType: "קבע", isTechnician: false, isSupervisor: false });

    const index = buildWeaponQualificationIndex({
      people: [person],
      sheetRecords: [],
      relevanceRecords: [],
      completions: [],
      today: "2026-08-25",
    });

    expect(index.has("p_perm_ns")).toBe(true);
  });

  it("includes a reserve (מילואים) person too -- the index covers the FULL roster, not just the מטווחים-eligible subset", () => {
    const reservist = makePerson({ id: "p_reserve", personnelType: "מילואים" });

    const index = buildWeaponQualificationIndex({
      people: [reservist],
      sheetRecords: [],
      relevanceRecords: [],
      completions: [],
      today: "2026-08-25",
    });

    expect(index.has("p_reserve")).toBe(true);
  });

  it("a person with no baseline/completion data at all gets a real entry with expiryDate: null -- never simply absent", () => {
    const person = makePerson({ id: "p_no_data" });

    const index = buildWeaponQualificationIndex({
      people: [person],
      sheetRecords: [],
      relevanceRecords: [],
      completions: [],
      today: "2026-08-25",
    });

    expect(index.get("p_no_data")).toEqual({ expiryDate: null, notRelevant: false });
  });

  it("resolves a non-shift-capable permanent person's real completion via the SAME baseline/expiry pipeline as everyone else", () => {
    const person = makePerson({ id: "p_perm" });

    const index = buildWeaponQualificationIndex({
      people: [person],
      sheetRecords: [],
      relevanceRecords: [],
      completions: [
        {
          id: "c1",
          personId: "p_perm",
          performedOn: "2026-06-29",
          source: "self_report",
          status: "approved",
          notes: null,
          submittedByPersonId: "p_perm",
          submittedByPersonName: "בדיקה",
          approvedByPersonId: "mgr1",
          approvedByPersonName: "מנהל",
          approvedAt: "2026-06-30T00:00:00.000Z",
          linkedPlannedDate: null,
          createdAt: "2026-06-29T00:00:00.000Z",
        },
      ],
      today: "2026-08-25",
    });

    expect(index.get("p_perm")).toEqual({ expiryDate: "2026-12-29", notRelevant: false });
  });

  it("still honors an explicit לא רלוונטי sheet override for a non-shift-capable permanent person -- a genuine existing exemption, not eligibility-gated", () => {
    const person = makePerson({ id: "p_perm_nr" });

    const index = buildWeaponQualificationIndex({
      people: [person],
      sheetRecords: [],
      relevanceRecords: [
        { sourceName: "בדיקה", resolvedPersonId: "p_perm_nr", relevance: "not_relevant", reason: "פטור שמירות", sourceSheet: "מטווחים", sourceCell: "E2" },
      ],
      completions: [],
      today: "2026-08-25",
    });

    expect(index.get("p_perm_nr")).toEqual({ expiryDate: null, notRelevant: true });
  });
});
