import { describe, expect, it } from "vitest";
import {
  buildNotificationCenterHref,
  notificationCenterSectionNeedsRosterAndAdoption,
  parseNotificationCenterSectionParam,
} from "./notificationCenterUrl";

describe("parseNotificationCenterSectionParam", () => {
  it("defaults to now for missing/unknown values", () => {
    expect(parseNotificationCenterSectionParam(undefined)).toBe("now");
    expect(parseNotificationCenterSectionParam(null)).toBe("now");
    expect(parseNotificationCenterSectionParam("bogus")).toBe("now");
    expect(parseNotificationCenterSectionParam("now")).toBe("now");
  });

  it("accepts the three other real sections", () => {
    expect(parseNotificationCenterSectionParam("schedule")).toBe("schedule");
    expect(parseNotificationCenterSectionParam("history")).toBe("history");
    expect(parseNotificationCenterSectionParam("fixed")).toBe("fixed");
  });
});

describe("notificationCenterSectionNeedsRosterAndAdoption", () => {
  it("is true for now/schedule/fixed", () => {
    expect(notificationCenterSectionNeedsRosterAndAdoption("now")).toBe(true);
    expect(notificationCenterSectionNeedsRosterAndAdoption("schedule")).toBe(true);
    expect(notificationCenterSectionNeedsRosterAndAdoption("fixed")).toBe(true);
  });

  it("is false for history -- it renders no roster/audience picker at all", () => {
    expect(notificationCenterSectionNeedsRosterAndAdoption("history")).toBe(false);
  });
});

describe("buildNotificationCenterHref", () => {
  it("the default section (now) is the bare /notifications", () => {
    expect(buildNotificationCenterHref("now")).toBe("/notifications");
  });

  it("every other section adds an explicit ?section=", () => {
    expect(buildNotificationCenterHref("schedule")).toBe("/notifications?section=schedule");
    expect(buildNotificationCenterHref("history")).toBe("/notifications?section=history");
    expect(buildNotificationCenterHref("fixed")).toBe("/notifications?section=fixed");
  });
});
