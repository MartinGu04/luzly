import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

const loadCalendarFeedForToken = vi.fn();

async function loadRoute() {
  vi.doMock("@/lib/calendar/loadCalendarFeedForToken", () => ({ loadCalendarFeedForToken }));
  return import("./route");
}

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://example.com"));
}

const VALID_TOKEN = "a".repeat(43);

describe("GET /calendar/[token].ics", () => {
  it("returns 404 (never touching the loader) when the segment doesn't end with .ics", async () => {
    const { GET } = await loadRoute();
    const response = await GET(request(`/calendar/${VALID_TOKEN}`), {
      params: Promise.resolve({ token: VALID_TOKEN }),
    });

    expect(response.status).toBe(404);
    expect(loadCalendarFeedForToken).not.toHaveBeenCalled();
  });

  it("returns 404 (never touching the loader) for a malformed token -- too short", async () => {
    const { GET } = await loadRoute();
    const response = await GET(request("/calendar/short.ics"), {
      params: Promise.resolve({ token: "short.ics" }),
    });

    expect(response.status).toBe(404);
    expect(loadCalendarFeedForToken).not.toHaveBeenCalled();
  });

  it("returns 404 (never touching the loader) for a malformed token -- disallowed characters", async () => {
    const badToken = "!@#$".repeat(11);
    const { GET } = await loadRoute();
    const response = await GET(request(`/calendar/${badToken}.ics`), {
      params: Promise.resolve({ token: `${badToken}.ics` }),
    });

    expect(response.status).toBe(404);
    expect(loadCalendarFeedForToken).not.toHaveBeenCalled();
  });

  it("strips the .ics suffix before calling the loader", async () => {
    loadCalendarFeedForToken.mockResolvedValue({ status: "not_found" });
    const { GET } = await loadRoute();

    await GET(request(`/calendar/${VALID_TOKEN}.ics`), { params: Promise.resolve({ token: `${VALID_TOKEN}.ics` }) });

    expect(loadCalendarFeedForToken).toHaveBeenCalledWith(VALID_TOKEN);
  });

  it("returns a generic 404 (never a distinguishable body) for an unknown/revoked token", async () => {
    loadCalendarFeedForToken.mockResolvedValue({ status: "not_found" });
    const { GET } = await loadRoute();

    const response = await GET(request(`/calendar/${VALID_TOKEN}.ics`), {
      params: Promise.resolve({ token: `${VALID_TOKEN}.ics` }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 200 with text/calendar and the rendered ICS body for a valid token", async () => {
    loadCalendarFeedForToken.mockResolvedValue({ status: "ok", icsText: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" });
    const { GET } = await loadRoute();

    const response = await GET(request(`/calendar/${VALID_TOKEN}.ics`), {
      params: Promise.resolve({ token: `${VALID_TOKEN}.ics` }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(await response.text()).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
  });

  it("never sets a public/shared Cache-Control (the feed is per-person, token-gated data)", async () => {
    loadCalendarFeedForToken.mockResolvedValue({ status: "ok", icsText: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" });
    const { GET } = await loadRoute();

    const response = await GET(request(`/calendar/${VALID_TOKEN}.ics`), {
      params: Promise.resolve({ token: `${VALID_TOKEN}.ics` }),
    });

    const cacheControl = response.headers.get("Cache-Control") ?? "";
    expect(cacheControl).toContain("private");
    expect(cacheControl).not.toContain("public");
  });
});
