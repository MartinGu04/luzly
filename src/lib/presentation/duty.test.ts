import { describe, expect, it } from "vitest";
import type { LocalNow } from "@/lib/domain/localNow";
import type { PersonalDutyAction, PersonalDutyBlock } from "@/lib/readModels/types";
import {
  actionsForBlock,
  dutyBlockEmoji,
  dutyBlockProgress,
  dutyBlockTitle,
  dutyCertaintyLabel,
  historyBlocks,
  isDutyActionPending,
  isWeekendKitchenPartial,
  parseDutyView,
  remainingUpcomingBlocks,
  selectDutyFocus,
  summarizePendingActions,
} from "./duty";

function block(overrides: Partial<PersonalDutyBlock> = {}): PersonalDutyBlock {
  return {
    dutyFamily: "guard",
    slot: 2,
    startDate: "2026-08-12",
    endDate: "2026-08-14",
    dates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    certainty: "confirmed",
    dayCount: 3,
    weekendCompleteness: "not_applicable",
    ...overrides,
  };
}

function action(overrides: Partial<PersonalDutyAction> = {}): PersonalDutyAction {
  return {
    type: "duty_check_in",
    date: "2026-08-12",
    localTime: "13:00",
    dutyFamily: "guard",
    slot: 2,
    ...overrides,
  };
}

function localNow(overrides: Partial<LocalNow> = {}): LocalNow {
  return { date: "2026-08-13", minuteOfDay: 10 * 60, ...overrides };
}

describe("dutyBlockTitle", () => {
  it("appends a non-null slot", () => {
    expect(dutyBlockTitle({ dutyFamily: "guard", slot: 2 })).toBe("שמירה 2");
    expect(dutyBlockTitle({ dutyFamily: "reserve", slot: 3 })).toBe("עתודה 3");
  });

  it("omits the slot entirely when null", () => {
    expect(dutyBlockTitle({ dutyFamily: "evacuation_on_call", slot: null })).toBe("כונן פינויים");
  });

  it("never inspects rawValue/title -- only structural family+slot", () => {
    // No rawValue/title field even exists on the input type -- this is a compile-time
    // guarantee, exercised here just to document the intent.
    expect(dutyBlockTitle({ dutyFamily: "rasar", slot: null })).toBe('רס"ר');
  });
});

describe("dutyBlockEmoji", () => {
  it("maps known families", () => {
    expect(dutyBlockEmoji({ dutyFamily: "guard" })).toBe("💂");
    expect(dutyBlockEmoji({ dutyFamily: "reserve" })).toBe("🪖");
  });

  it("renders cleanly (null) for a family with no assigned emoji, never inventing one", () => {
    expect(dutyBlockEmoji({ dutyFamily: "rasar" })).toBeNull();
    expect(dutyBlockEmoji({ dutyFamily: "oxid" })).toBeNull();
  });
});

describe("dutyCertaintyLabel", () => {
  it("confirmed needs no badge", () => {
    expect(dutyCertaintyLabel("confirmed")).toBeNull();
  });

  it("tentative -> משוער", () => {
    expect(dutyCertaintyLabel("tentative")).toBe("משוער");
  });

  it("mixed -> חלקית משוער, distinct from plain tentative", () => {
    expect(dutyCertaintyLabel("mixed")).toBe("חלקית משוער");
    expect(dutyCertaintyLabel("mixed")).not.toBe(dutyCertaintyLabel("tentative"));
  });
});

describe("isWeekendKitchenPartial", () => {
  it("flags a partial weekend_kitchen block", () => {
    expect(isWeekendKitchenPartial({ dutyFamily: "weekend_kitchen", weekendCompleteness: "partial" })).toBe(true);
  });

  it("does not warn a complete weekend_kitchen block", () => {
    expect(isWeekendKitchenPartial({ dutyFamily: "weekend_kitchen", weekendCompleteness: "complete" })).toBe(false);
  });

  it("never flags a non-weekend_kitchen family, regardless of weekendCompleteness", () => {
    expect(isWeekendKitchenPartial({ dutyFamily: "guard", weekendCompleteness: "partial" })).toBe(false);
  });
});

describe("dutyBlockProgress", () => {
  it("day 1 of 3", () => {
    expect(dutyBlockProgress(block(), "2026-08-12")).toEqual({ dayIndex: 1, totalDays: 3 });
  });

  it("day 2 of 3", () => {
    expect(dutyBlockProgress(block(), "2026-08-13")).toEqual({ dayIndex: 2, totalDays: 3 });
  });

  it("the final day", () => {
    expect(dutyBlockProgress(block(), "2026-08-14")).toEqual({ dayIndex: 3, totalDays: 3 });
  });

  it("uses the block's actual dates[] only -- a date outside it (even inside startDate..endDate) is not active", () => {
    const withHole = block({ dates: ["2026-08-12", "2026-08-14"], startDate: "2026-08-12", endDate: "2026-08-14" });
    expect(dutyBlockProgress(withHole, "2026-08-13")).toBeNull();
  });

  it("returns null when todayDate isn't in the block at all", () => {
    expect(dutyBlockProgress(block(), "2026-09-01")).toBeNull();
  });
});

describe("actionsForBlock", () => {
  it("matches by family + slot + block date", () => {
    const actions = [action({ date: "2026-08-12" }), action({ date: "2026-08-13" })];
    expect(actionsForBlock(block(), actions)).toHaveLength(2);
  });

  it("excludes an action from an unrelated duty family", () => {
    const actions = [action({ dutyFamily: "reserve" })];
    expect(actionsForBlock(block(), actions)).toHaveLength(0);
  });

  it("excludes an action from a different slot", () => {
    const actions = [action({ slot: 1 })];
    expect(actionsForBlock(block(), actions)).toHaveLength(0);
  });

  it("the block's final day never has a fabricated action -- absence of one is respected, not filled", () => {
    // deriveDutyActions never emits an action for the last day; simulate that faithfully.
    const actions = [action({ date: "2026-08-12" }), action({ date: "2026-08-13" })]; // no 08-14 (final day)
    const matched = actionsForBlock(block(), actions);
    expect(matched.some((a) => a.date === "2026-08-14")).toBe(false);
  });
});

describe("isDutyActionPending", () => {
  it("a future date is pending", () => {
    expect(isDutyActionPending(action({ date: "2026-08-20" }), localNow({ date: "2026-08-13" }))).toBe(true);
  });

  it("a past date is not pending", () => {
    expect(isDutyActionPending(action({ date: "2026-08-01" }), localNow({ date: "2026-08-13" }))).toBe(false);
  });

  it("today at 12:59, before the 13:00 action -- still pending", () => {
    const now = localNow({ date: "2026-08-12", minuteOfDay: 12 * 60 + 59 });
    expect(isDutyActionPending(action({ date: "2026-08-12", localTime: "13:00" }), now)).toBe(true);
  });

  it("today at exactly 13:00 -- still pending (due, not yet missed)", () => {
    const now = localNow({ date: "2026-08-12", minuteOfDay: 13 * 60 });
    expect(isDutyActionPending(action({ date: "2026-08-12", localTime: "13:00" }), now)).toBe(true);
  });

  it("today at 13:01, after the 13:00 action -- no longer pending", () => {
    const now = localNow({ date: "2026-08-12", minuteOfDay: 13 * 60 + 1 });
    expect(isDutyActionPending(action({ date: "2026-08-12", localTime: "13:00" }), now)).toBe(false);
  });

  it("yesterday's action is not pending regardless of time", () => {
    const now = localNow({ date: "2026-08-13", minuteOfDay: 0 });
    expect(isDutyActionPending(action({ date: "2026-08-12", localTime: "13:00" }), now)).toBe(false);
  });
});

describe("summarizePendingActions", () => {
  it("a single today-due action reads 'בדיקה היום · HH:mm'", () => {
    const now = localNow({ date: "2026-08-12", minuteOfDay: 10 * 60 });
    const summary = summarizePendingActions([action({ date: "2026-08-12", localTime: "13:00" })], now);
    expect(summary).toEqual({ label: "בדיקה", items: ["היום · 13:00"] });
  });

  it("multiple pending actions read 'בדיקות' with compact-date entries", () => {
    const now = localNow({ date: "2026-08-18" });
    const summary = summarizePendingActions(
      [action({ date: "2026-08-19", localTime: "13:00" }), action({ date: "2026-08-20", localTime: "13:00" })],
      now,
    );
    expect(summary).toEqual({ label: "בדיקות", items: ["19.8 · 13:00", "20.8 · 13:00"] });
  });

  it("returns null once nothing is pending", () => {
    const now = localNow({ date: "2026-08-15" });
    expect(summarizePendingActions([action({ date: "2026-08-12" })], now)).toBeNull();
  });
});

describe("selectDutyFocus", () => {
  it("one active block", () => {
    const b = block({ dates: ["2026-08-12", "2026-08-13"] });
    const focus = selectDutyFocus([b], "2026-08-12");
    expect(focus).toEqual({ status: "active", blocks: [b] });
  });

  it("multiple simultaneously active blocks are all preserved, never collapsed to one", () => {
    const a = block({ dutyFamily: "guard", slot: 1, dates: ["2026-08-12"] });
    const b = block({ dutyFamily: "reserve", slot: 1, dates: ["2026-08-12"] });
    const focus = selectDutyFocus([a, b], "2026-08-12");
    expect(focus.status).toBe("active");
    expect(focus.blocks).toHaveLength(2);
    expect(focus.blocks).toEqual(expect.arrayContaining([a, b]));
  });

  it("no active block -> the earliest future block", () => {
    const soon = block({ startDate: "2026-08-20", dates: ["2026-08-20"] });
    const later = block({ startDate: "2026-08-25", dates: ["2026-08-25"] });
    const focus = selectDutyFocus([later, soon], "2026-08-15");
    expect(focus).toEqual({ status: "next", blocks: [soon] });
  });

  it("multiple future blocks sharing the earliest start date are all shown", () => {
    const a = block({ dutyFamily: "guard", slot: 1, startDate: "2026-08-20", dates: ["2026-08-20"] });
    const b = block({ dutyFamily: "reserve", slot: 1, startDate: "2026-08-20", dates: ["2026-08-20"] });
    const later = block({ dutyFamily: "guard", slot: 2, startDate: "2026-08-25", dates: ["2026-08-25"] });
    const focus = selectDutyFocus([a, later, b], "2026-08-15");
    expect(focus.status).toBe("next");
    expect(focus.blocks).toHaveLength(2);
    expect(focus.blocks).toEqual(expect.arrayContaining([a, b]));
  });

  it("no active or future duties at all", () => {
    const past = block({ startDate: "2026-08-01", endDate: "2026-08-02", dates: ["2026-08-01", "2026-08-02"] });
    expect(selectDutyFocus([past], "2026-08-15")).toEqual({ status: "none", blocks: [] });
  });

  it("never fabricates a future duty when there truly are none", () => {
    expect(selectDutyFocus([], "2026-08-15")).toEqual({ status: "none", blocks: [] });
  });
});

describe("remainingUpcomingBlocks", () => {
  it("includes an active block not already in focus (defensive), and a future block", () => {
    const active = block({ dates: ["2026-08-12"], startDate: "2026-08-12", endDate: "2026-08-12" });
    const future = block({ dutyFamily: "reserve", startDate: "2026-08-20", endDate: "2026-08-20", dates: ["2026-08-20"] });
    const result = remainingUpcomingBlocks([active, future], [], "2026-08-12");
    expect(result).toContain(active);
    expect(result).toContain(future);
  });

  it("excludes a block already shown in the focus section", () => {
    const focus = block({ dates: ["2026-08-12"], startDate: "2026-08-12", endDate: "2026-08-12" });
    const other = block({ dutyFamily: "reserve", startDate: "2026-08-20", endDate: "2026-08-20", dates: ["2026-08-20"] });
    const result = remainingUpcomingBlocks([focus, other], [focus], "2026-08-12");
    expect(result).not.toContain(focus);
    expect(result).toContain(other);
  });

  it("excludes a completed block", () => {
    const completed = block({ startDate: "2026-08-01", endDate: "2026-08-02", dates: ["2026-08-01", "2026-08-02"] });
    expect(remainingUpcomingBlocks([completed], [], "2026-08-15")).toHaveLength(0);
  });

  it("is chronological by start date", () => {
    const later = block({ dutyFamily: "reserve", startDate: "2026-08-25", endDate: "2026-08-25", dates: ["2026-08-25"] });
    const sooner = block({ dutyFamily: "guard", startDate: "2026-08-20", endDate: "2026-08-20", dates: ["2026-08-20"] });
    const result = remainingUpcomingBlocks([later, sooner], [], "2026-08-15");
    expect(result.map((b) => b.startDate)).toEqual(["2026-08-20", "2026-08-25"]);
  });
});

describe("historyBlocks", () => {
  it("includes a completed block", () => {
    const completed = block({ startDate: "2026-08-01", endDate: "2026-08-02", dates: ["2026-08-01", "2026-08-02"] });
    expect(historyBlocks([completed], "2026-08-15")).toContain(completed);
  });

  it("excludes an active/future block", () => {
    const active = block({ dates: ["2026-08-12"], startDate: "2026-08-12", endDate: "2026-08-12" });
    expect(historyBlocks([active], "2026-08-12")).toHaveLength(0);
  });

  it("is sorted newest-first", () => {
    const older = block({ dutyFamily: "guard", startDate: "2026-08-01", endDate: "2026-08-02", dates: ["2026-08-01", "2026-08-02"] });
    const newer = block({ dutyFamily: "reserve", startDate: "2026-08-05", endDate: "2026-08-06", dates: ["2026-08-05", "2026-08-06"] });
    const result = historyBlocks([older, newer], "2026-08-15");
    expect(result.map((b) => b.endDate)).toEqual(["2026-08-06", "2026-08-02"]);
  });

  it("bounds the result rather than dumping unlimited history", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      block({
        dutyFamily: "guard",
        slot: i,
        startDate: `2026-07-${String(i + 1).padStart(2, "0")}`,
        endDate: `2026-07-${String(i + 1).padStart(2, "0")}`,
        dates: [`2026-07-${String(i + 1).padStart(2, "0")}`],
      }),
    );
    expect(historyBlocks(many, "2026-08-15", 12)).toHaveLength(12);
  });
});

describe("parseDutyView", () => {
  it("recognizes 'history'", () => {
    expect(parseDutyView("history")).toBe("history");
  });

  it("falls back to 'upcoming' for anything else, including garbage", () => {
    expect(parseDutyView(undefined)).toBe("upcoming");
    expect(parseDutyView("")).toBe("upcoming");
    expect(parseDutyView("Upcoming")).toBe("upcoming");
    expect(parseDutyView("../../etc/passwd")).toBe("upcoming");
  });
});

describe("multiple/overlapping duty blocks", () => {
  it("two blocks overlapping on the same date are both preserved, never collapsed", () => {
    const a = block({ dutyFamily: "guard", slot: 1, dates: ["2026-08-12", "2026-08-13"] });
    const b = block({ dutyFamily: "full_kitchen", slot: null, dates: ["2026-08-12", "2026-08-13"] });
    const focus = selectDutyFocus([a, b], "2026-08-12");
    expect(focus.blocks).toHaveLength(2);
  });
});
