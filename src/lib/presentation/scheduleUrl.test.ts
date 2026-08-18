import { describe, expect, it } from "vitest";
import { scheduleEveryoneHref, schedulePersonHref } from "./scheduleUrl";

describe("scheduleEveryoneHref", () => {
  it("no params -> /schedule?person=all", () => {
    expect(scheduleEveryoneHref()).toBe("/schedule?person=all");
    expect(scheduleEveryoneHref({})).toBe("/schedule?person=all");
  });

  it("a date pre-selects that day", () => {
    expect(scheduleEveryoneHref({ date: "2026-08-19" })).toBe("/schedule?person=all&date=2026-08-19");
  });

  it("a null/omitted date is left out, never a literal 'null'", () => {
    expect(scheduleEveryoneHref({ date: null })).toBe("/schedule?person=all");
  });
});

describe("schedulePersonHref", () => {
  it("just a personId -> /schedule?person=<id>", () => {
    expect(schedulePersonHref({ personId: "p_1" })).toBe("/schedule?person=p_1");
  });

  it("a date pre-selects that day", () => {
    expect(schedulePersonHref({ personId: "p_1", date: "2026-08-19" })).toBe(
      "/schedule?person=p_1&date=2026-08-19",
    );
  });
});
