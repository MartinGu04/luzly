import { describe, expect, it } from "vitest";
import {
  combineFairnessDataCompleteness,
  COMPLETE_FAIRNESS_DATA,
  countFairnessWeekendDates,
  fairnessDataCompleteness,
  FAIRNESS_MODEL_VERSION,
  isFairnessWeekendDate,
  resolveFairnessPeriodStatus,
} from "./fairnessFoundation";
import type { LocalNow } from "./localNow";

function localNow(date: string): LocalNow {
  return { date, minuteOfDay: 600 };
}

describe("FAIRNESS_MODEL_VERSION", () => {
  it("is a stable positive integer", () => {
    expect(FAIRNESS_MODEL_VERSION).toBe(1);
  });
});

describe("resolveFairnessPeriodStatus", () => {
  it("a period ending before today is closed", () => {
    expect(resolveFairnessPeriodStatus("2026-07-31", localNow("2026-08-01"))).toBe("closed");
  });

  it("a period ending today is still current", () => {
    expect(resolveFairnessPeriodStatus("2026-08-01", localNow("2026-08-01"))).toBe("current");
  });

  it("a period ending in the future is current", () => {
    expect(resolveFairnessPeriodStatus("2026-12-31", localNow("2026-08-01"))).toBe("current");
  });

  it("an unparseable end date is never fabricated as closed", () => {
    expect(resolveFairnessPeriodStatus("not-a-date", localNow("2026-08-01"))).toBe("current");
  });
});

describe("fairnessDataCompleteness / combineFairnessDataCompleteness", () => {
  it("no reasons -> complete, same reference as COMPLETE_FAIRNESS_DATA", () => {
    expect(fairnessDataCompleteness([])).toEqual(COMPLETE_FAIRNESS_DATA);
  });

  it("any reason -> partial, reasons preserved", () => {
    expect(fairnessDataCompleteness(["participation_unknown"])).toEqual({
      status: "partial",
      reasons: ["participation_unknown"],
    });
  });

  it("duplicate reasons are deduplicated", () => {
    expect(fairnessDataCompleteness(["participation_unknown", "participation_unknown"])).toEqual({
      status: "partial",
      reasons: ["participation_unknown"],
    });
  });

  it("combining all-complete parts stays complete", () => {
    const combined = combineFairnessDataCompleteness([COMPLETE_FAIRNESS_DATA, COMPLETE_FAIRNESS_DATA]);
    expect(combined).toEqual(COMPLETE_FAIRNESS_DATA);
  });

  it("combining mixes reasons from every partial part", () => {
    const combined = combineFairnessDataCompleteness([
      fairnessDataCompleteness(["participation_inferred"]),
      COMPLETE_FAIRNESS_DATA,
      fairnessDataCompleteness(["eligibility_undated"]),
    ]);
    expect(combined.status).toBe("partial");
    expect(combined.reasons).toEqual(["participation_inferred", "eligibility_undated"]);
  });
});

describe("isFairnessWeekendDate — Thursday-Friday-Saturday", () => {
  it.each([
    ["2026-08-13", true], // Thursday
    ["2026-08-14", true], // Friday
    ["2026-08-15", true], // Saturday
    ["2026-08-16", false], // Sunday
    ["2026-08-12", false], // Wednesday
  ])("%s -> %s", (date, expected) => {
    expect(isFairnessWeekendDate(date)).toBe(expected);
  });

  it("an unparseable date is never treated as a weekend", () => {
    expect(isFairnessWeekendDate("not-a-date")).toBe(false);
  });
});

describe("countFairnessWeekendDates", () => {
  it("counts only the Thu-Fri-Sat dates in the list", () => {
    const dates = ["2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"];
    expect(countFairnessWeekendDates(dates)).toBe(3);
  });

  it("empty list -> 0", () => {
    expect(countFairnessWeekendDates([])).toBe(0);
  });
});
