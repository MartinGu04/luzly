import { describe, expect, it } from "vitest";
import { buildSettledChangeCopy } from "./copy";
import type { FactChange } from "./diffFacts";

const names = new Map([["p2", "עילאי שפירא"]]);

describe("buildSettledChangeCopy -- shift change", () => {
  it("a period change renders the exact 'X -> Y' format", () => {
    const change: FactChange = {
      factKey: "shift:p1:2026-08-18",
      category: "shift",
      oldValue: { entries: [{ period: "day", role: "technician", shadow: false }] },
      newValue: { entries: [{ period: "night", role: "technician", shadow: false }] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.title).toBe("⚠️ שינוי בשיבוץ");
    expect(copy?.body).toContain("יום → לילה");
    expect(copy?.path).toBe("/schedule");
  });

  it("a brand-new assignment says 'assigned', not 'changed'", () => {
    const change: FactChange = {
      factKey: "shift:p1:2026-08-18",
      category: "shift",
      oldValue: null,
      newValue: { entries: [{ period: "day", role: "technician", shadow: false }] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toContain("שובצת");
  });

  it("a removed assignment says the shift was cancelled", () => {
    const change: FactChange = {
      factKey: "shift:p1:2026-08-18",
      category: "shift",
      oldValue: { entries: [{ period: "day", role: "technician", shadow: false }] },
      newValue: null,
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toContain("בוטל");
  });

  it("a complex multi-entry change falls back to a concise truthful message rather than inventing details", () => {
    const change: FactChange = {
      factKey: "shift:p1:2026-08-18",
      category: "shift",
      oldValue: { entries: [{ period: "day", role: "technician", shadow: false }] },
      newValue: {
        entries: [
          { period: "day", role: "technician", shadow: false },
          { period: "night", role: "supervisor", shadow: false },
        ],
      },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toBe("השיבוץ שלך ליום שלישי השתנה");
  });
});

describe("buildSettledChangeCopy -- team change", () => {
  it("a single colleague joining names them by their real name", () => {
    const change: FactChange = {
      factKey: "team:p1:2026-08-18:day",
      category: "team",
      oldValue: { colleagues: [] },
      newValue: { colleagues: ["p2"] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toBe("עילאי שפירא שובץ איתך למשמרת היום ביום שלישי");
    expect(copy?.path).toBe("/");
  });

  it("a single colleague leaving says they're no longer assigned", () => {
    const change: FactChange = {
      factKey: "team:p1:2026-08-18:day",
      category: "team",
      oldValue: { colleagues: ["p2"] },
      newValue: { colleagues: [] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toBe("עילאי שפירא כבר לא משובץ איתך למשמרת היום ביום שלישי");
  });

  it("multiple simultaneous joins/leaves fall back to a generic team-change message", () => {
    const change: FactChange = {
      factKey: "team:p1:2026-08-18:day",
      category: "team",
      oldValue: { colleagues: ["p2"] },
      newValue: { colleagues: ["p3", "p4"] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toContain("הצוות שלך");
  });
});

describe("buildSettledChangeCopy -- duty change", () => {
  it("a new duty is announced as added", () => {
    const change: FactChange = {
      factKey: "duty:p1:2026-08-19",
      category: "duty",
      oldValue: null,
      newValue: { entries: [{ dutyFamily: "guard", slot: 1 }] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toContain("נוספה לך תורנות");
    expect(copy?.path).toBe("/duties");
  });

  it("a removed duty is announced as cancelled", () => {
    const change: FactChange = {
      factKey: "duty:p1:2026-08-19",
      category: "duty",
      oldValue: { entries: [{ dutyFamily: "guard", slot: 1 }] },
      newValue: null,
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toContain("בוטלה");
  });
});

describe("buildSettledChangeCopy -- coverage gap", () => {
  it("names the specific missing role", () => {
    const change: FactChange = {
      factKey: "coverage:2026-08-20:night",
      category: "coverage",
      oldValue: { status: "full", missingTechnician: false, missingSupervisor: false },
      newValue: { status: "missing", missingTechnician: false, missingSupervisor: true },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.title).toBe("🚨 חוסר בכיסוי");
    expect(copy?.body).toContain('אחמ"ש');
    expect(copy?.path).toBe("/manager");
  });

  it("returns null when there is no fresh coverage value to report on", () => {
    const change: FactChange = {
      factKey: "coverage:2026-08-20:night",
      category: "coverage",
      oldValue: { status: "missing", missingTechnician: false, missingSupervisor: true },
      newValue: null,
    };
    expect(buildSettledChangeCopy(change, names)).toBeNull();
  });
});

describe("buildSettledChangeCopy -- Emergency Mode desk shift change (spec section 23)", () => {
  it("a brand-new desk assignment names the desk(s) and says 'assigned', not 'changed'", () => {
    const change: FactChange = {
      factKey: "emergency_shift:p1:2026-08-18",
      category: "emergency_shift",
      oldValue: null,
      newValue: { entries: [{ period: "day", desk: "הוגוורט" }] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.title).toBe("🚨 שינוי בשיבוץ דסק");
    expect(copy?.body).toContain("שובצת לדסק הוגוורט");
    expect(copy?.path).toBe("/schedule");
  });

  it("a removed desk assignment says the assignment was cancelled", () => {
    const change: FactChange = {
      factKey: "emergency_shift:p1:2026-08-18",
      category: "emergency_shift",
      oldValue: { entries: [{ period: "day", desk: "הוגוורט" }] },
      newValue: null,
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toContain("בוטל");
  });

  it("a desk swap falls back to a concise truthful 'changed' message", () => {
    const change: FactChange = {
      factKey: "emergency_shift:p1:2026-08-18",
      category: "emergency_shift",
      oldValue: { entries: [{ period: "day", desk: "הוגוורט" }] },
      newValue: { entries: [{ period: "day", desk: "תיעוד" }] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toContain("השתנה");
  });

  it("never uses the regular shift copy's title/path -- Emergency Mode's own vocabulary", () => {
    const change: FactChange = {
      factKey: "emergency_shift:p1:2026-08-18",
      category: "emergency_shift",
      oldValue: null,
      newValue: { entries: [{ period: "day", desk: "הוגוורט" }] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.title).not.toBe("⚠️ שינוי בשיבוץ");
  });
});

describe("buildSettledChangeCopy -- Emergency Mode desk team change (spec section 23)", () => {
  it("a single colleague joining names them by their real name", () => {
    const change: FactChange = {
      factKey: "emergency_team:p1:2026-08-18:day",
      category: "emergency_team",
      oldValue: { colleagues: [] },
      newValue: { colleagues: ["p2"] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toBe("עילאי שפירא שובץ איתך למשמרת היום ביום שלישי");
    expect(copy?.path).toBe("/");
  });

  it("a single colleague leaving says they're no longer assigned", () => {
    const change: FactChange = {
      factKey: "emergency_team:p1:2026-08-18:day",
      category: "emergency_team",
      oldValue: { colleagues: ["p2"] },
      newValue: { colleagues: [] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toBe("עילאי שפירא כבר לא משובץ איתך למשמרת היום ביום שלישי");
  });

  it("multiple simultaneous joins/leaves fall back to a generic team-change message", () => {
    const change: FactChange = {
      factKey: "emergency_team:p1:2026-08-18:day",
      category: "emergency_team",
      oldValue: { colleagues: ["p2"] },
      newValue: { colleagues: ["p3", "p4"] },
    };
    const copy = buildSettledChangeCopy(change, names);
    expect(copy?.body).toContain("הצוות שלך");
  });
});
