import { describe, expect, it } from "vitest";
import {
  appleCalendarSubscribeUrl,
  buildCalendarFeedLinks,
  calendarFeedHttpsUrl,
  calendarFeedPath,
  googleCalendarSubscribeUrl,
  resolveOriginFromHeaders,
} from "./feedUrl";

describe("calendarFeedPath", () => {
  it("builds /calendar/<token>.ics", () => {
    expect(calendarFeedPath("abc123")).toBe("/calendar/abc123.ics");
  });

  it("URL-encodes a token containing base64url-unsafe-looking characters defensively", () => {
    expect(calendarFeedPath("a/b")).toBe("/calendar/a%2Fb.ics");
  });
});

describe("calendarFeedHttpsUrl", () => {
  it("joins origin and path", () => {
    expect(calendarFeedHttpsUrl("https://mi-ma-mo.app", "tok")).toBe("https://mi-ma-mo.app/calendar/tok.ics");
  });
});

describe("appleCalendarSubscribeUrl", () => {
  it("swaps https:// for webcal:// and keeps everything else identical", () => {
    expect(appleCalendarSubscribeUrl("https://mi-ma-mo.app/calendar/tok.ics")).toBe(
      "webcal://mi-ma-mo.app/calendar/tok.ics",
    );
  });
});

describe("googleCalendarSubscribeUrl", () => {
  it("builds the calendar.google.com cid= deep link with a URL-encoded webcal:// address", () => {
    const url = googleCalendarSubscribeUrl("https://mi-ma-mo.app/calendar/tok.ics");
    expect(url).toBe(
      "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent("webcal://mi-ma-mo.app/calendar/tok.ics"),
    );
  });
});

describe("resolveOriginFromHeaders", () => {
  it("prefers x-forwarded-host/x-forwarded-proto over the plain host header", () => {
    expect(resolveOriginFromHeaders("internal:3000", "mi-ma-mo.app", "https")).toBe("https://mi-ma-mo.app");
  });

  it("falls back to the plain host header when no forwarded host is present", () => {
    expect(resolveOriginFromHeaders("mi-ma-mo.app", null, "https")).toBe("https://mi-ma-mo.app");
  });

  it("defaults to https for a non-local host with no forwarded proto", () => {
    expect(resolveOriginFromHeaders("mi-ma-mo.app", null, null)).toBe("https://mi-ma-mo.app");
  });

  it("defaults to http for localhost with no forwarded proto", () => {
    expect(resolveOriginFromHeaders("localhost:3000", null, null)).toBe("http://localhost:3000");
    expect(resolveOriginFromHeaders("127.0.0.1:3000", null, null)).toBe("http://127.0.0.1:3000");
  });

  it("returns null when no host is present at all", () => {
    expect(resolveOriginFromHeaders(null, null, null)).toBeNull();
  });
});

describe("buildCalendarFeedLinks", () => {
  it("builds all three links consistently from the same origin+token", () => {
    const links = buildCalendarFeedLinks("https://mi-ma-mo.app", "tok");
    expect(links.url).toBe("https://mi-ma-mo.app/calendar/tok.ics");
    expect(links.appleUrl).toBe("webcal://mi-ma-mo.app/calendar/tok.ics");
    expect(links.googleUrl).toContain(encodeURIComponent("webcal://mi-ma-mo.app/calendar/tok.ics"));
  });
});
