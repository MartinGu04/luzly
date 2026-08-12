import { describe, expect, it } from "vitest";
import type { DutyFamily, Event } from "./event";
import { buildDutyBlocks } from "./dutyBlocks";
import { deriveDutyActions } from "./dutyActions";

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function baseEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_test",
    personName: "דני בדיקה",
    date: "2026-01-05",
    title: "שומר 1",
    rawValue: "שומר 1",
    category: "duty",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: nextCell(),
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: null,
    absenceKind: null,
    ...overrides,
  };
}

function dutyEvent(family: DutyFamily, overrides: Partial<Event> = {}): Event {
  return baseEvent({ category: "duty", dutyFamily: family, ...overrides });
}

function guardEvent(date: string, slot: number, overrides: Partial<Event> = {}): Event {
  return dutyEvent("guard", { date, slot, ...overrides });
}

function reserveEvent(date: string, slot: number, overrides: Partial<Event> = {}): Event {
  return dutyEvent("reserve", { date, slot, ...overrides });
}

describe("deriveDutyActions — one-day blocks", () => {
  it("26. a one-day block produces exactly one 13:00 action", () => {
    const blocks = buildDutyBlocks([guardEvent("2026-01-05", 1)]);
    const actions = deriveDutyActions(blocks);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: "duty_check_in",
      personId: "p_test",
      date: "2026-01-05",
      localTime: "13:00",
    });
  });

  it("31. a one-day oxid produces a same-day 13:00 action", () => {
    const event = dutyEvent("oxid", { date: "2026-01-05" });
    const blocks = buildDutyBlocks([event]);
    const actions = deriveDutyActions(blocks);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ date: "2026-01-05", localTime: "13:00" });
  });
});

describe("deriveDutyActions — multi-day blocks", () => {
  it("27. a 3-day block gets actions on the first two dates only", () => {
    const events = [guardEvent("2026-01-05", 1), guardEvent("2026-01-06", 1), guardEvent("2026-01-07", 1)];
    const blocks = buildDutyBlocks(events);
    const actions = deriveDutyActions(blocks);
    expect(actions.map((a) => a.date)).toEqual(["2026-01-05", "2026-01-06"]);
  });

  it("28. the final day of a multi-day block gets no action", () => {
    const events = [guardEvent("2026-01-05", 1), guardEvent("2026-01-06", 1), guardEvent("2026-01-07", 1)];
    const blocks = buildDutyBlocks(events);
    const actions = deriveDutyActions(blocks);
    expect(actions.some((a) => a.date === "2026-01-07")).toBe(false);
  });

  it("29. a two-day block produces an action only on the first date", () => {
    const events = [guardEvent("2026-01-05", 1), guardEvent("2026-01-06", 1)];
    const blocks = buildDutyBlocks(events);
    const actions = deriveDutyActions(blocks);
    expect(actions).toHaveLength(1);
    expect(actions[0].date).toBe("2026-01-05");
  });

  it("32. guard multi-day -> every actual date except the final one", () => {
    const events = [
      guardEvent("2026-01-05", 2),
      guardEvent("2026-01-06", 2),
      guardEvent("2026-01-07", 2),
    ];
    const blocks = buildDutyBlocks(events);
    const actions = deriveDutyActions(blocks);
    expect(actions.map((a) => a.date)).toEqual(["2026-01-05", "2026-01-06"]);
  });

  it("33. reserve multi-day -> every actual date except the final one", () => {
    const events = [reserveEvent("2026-01-05", 1), reserveEvent("2026-01-06", 1), reserveEvent("2026-01-07", 1)];
    const blocks = buildDutyBlocks(events);
    const actions = deriveDutyActions(blocks);
    expect(actions.map((a) => a.date)).toEqual(["2026-01-05", "2026-01-06"]);
  });
});

describe("deriveDutyActions — weekend kitchen uses the same rule", () => {
  it("30. a complete Thu-Sat weekend kitchen block gets Thu/Fri actions only", () => {
    // Verified against an independent calendar: 2026-01-01/02/03 are Thu/Fri/Sat.
    const events = [
      dutyEvent("weekend_kitchen", { date: "2026-01-01" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-02" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-03" }),
    ];
    const blocks = buildDutyBlocks(events);
    expect(blocks[0].weekendCompleteness).toBe("complete");
    const actions = deriveDutyActions(blocks);
    expect(actions.map((a) => a.date)).toEqual(["2026-01-01", "2026-01-02"]);
    expect(actions.some((a) => a.date === "2026-01-03")).toBe(false);
  });

  it("does not run a special weekend-kitchen reminder engine (identical shape to a generic multi-day block)", () => {
    const guardEvents = [guardEvent("2026-01-05", 1), guardEvent("2026-01-06", 1), guardEvent("2026-01-07", 1)];
    const kitchenEvents = [
      dutyEvent("weekend_kitchen", { date: "2026-01-01", personId: "p_kitchen" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-02", personId: "p_kitchen" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-03", personId: "p_kitchen" }),
    ];
    const guardActions = deriveDutyActions(buildDutyBlocks(guardEvents));
    const kitchenActions = deriveDutyActions(buildDutyBlocks(kitchenEvents));
    expect(guardActions).toHaveLength(2);
    expect(kitchenActions).toHaveLength(2);
    expect(guardActions.every((a) => a.type === "duty_check_in" && a.localTime === "13:00")).toBe(true);
    expect(kitchenActions.every((a) => a.type === "duty_check_in" && a.localTime === "13:00")).toBe(true);
  });
});

describe("deriveDutyActions — independent one-day blocks", () => {
  it("34. two separate one-day blocks each produce their own action", () => {
    const events = [guardEvent("2026-01-05", 1), guardEvent("2026-01-07", 1)];
    const blocks = buildDutyBlocks(events);
    expect(blocks).toHaveLength(2);
    const actions = deriveDutyActions(blocks);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.date)).toEqual(["2026-01-05", "2026-01-07"]);
  });
});

describe("deriveDutyActions — time/date representation", () => {
  it("35. localTime is exactly \"13:00\"", () => {
    const blocks = buildDutyBlocks([guardEvent("2026-01-05", 1)]);
    const [action] = deriveDutyActions(blocks);
    expect(action.localTime).toBe("13:00");
  });

  it("36. actions use a plain local date string, no timezone conversion", () => {
    const blocks = buildDutyBlocks([guardEvent("2026-01-05", 1)]);
    const [action] = deriveDutyActions(blocks);
    expect(action.date).toBe("2026-01-05");
    expect(action.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("localTime is stable regardless of the process timezone", () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati";
      const ahead = deriveDutyActions(buildDutyBlocks([guardEvent("2026-01-05", 1)]))[0];
      process.env.TZ = "Etc/GMT+12";
      const behind = deriveDutyActions(buildDutyBlocks([guardEvent("2026-01-05", 1)]))[0];
      expect(ahead.date).toBe("2026-01-05");
      expect(ahead.localTime).toBe("13:00");
      expect(behind.date).toBe("2026-01-05");
      expect(behind.localTime).toBe("13:00");
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe("deriveDutyActions — determinism, immutability, evidence", () => {
  it("37. output is deterministic independent of Event input order", () => {
    const e1 = guardEvent("2026-01-05", 1);
    const e2 = guardEvent("2026-01-06", 1);
    const e3 = guardEvent("2026-01-07", 1);
    const forward = deriveDutyActions(buildDutyBlocks([e1, e2, e3]));
    const shuffled = deriveDutyActions(buildDutyBlocks([e3, e1, e2]));
    expect(shuffled.map((a) => [a.date, a.personId])).toEqual(forward.map((a) => [a.date, a.personId]));
  });

  it("38. Event objects are not mutated", () => {
    const event = Object.freeze(guardEvent("2026-01-05", 1));
    const blocks = buildDutyBlocks([event]);
    expect(() => deriveDutyActions(blocks)).not.toThrow();
    expect(event.slot).toBe(1);
  });

  it("39. source Event references are preserved on the action", () => {
    const event = guardEvent("2026-01-05", 1);
    const blocks = buildDutyBlocks([event]);
    const [action] = deriveDutyActions(blocks);
    expect(action.sourceEvents).toEqual([event]);
    expect(action.dutyBlock).toBe(blocks[0]);
  });

  it("40. multiple different Events on the same day do not create duplicate same-date actions", () => {
    const a = guardEvent("2026-01-05", 1, { sourceCell: "C1" });
    const b = guardEvent("2026-01-05", 1, { sourceCell: "C2" });
    const c = guardEvent("2026-01-06", 1, { sourceCell: "C3" });
    const blocks = buildDutyBlocks([a, b, c]);
    const actions = deriveDutyActions(blocks);
    // 2 unique dates in a 2-day block -> exactly one action (final date excluded), not one per Event.
    expect(actions).toHaveLength(1);
    expect(actions[0].date).toBe("2026-01-05");
    expect(actions[0].sourceEvents).toEqual(expect.arrayContaining([a, b]));
    expect(actions[0].sourceEvents).toHaveLength(2);
  });
});
