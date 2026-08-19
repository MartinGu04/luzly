import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getRequestPersonalSchedule = vi.fn();
const getCalendarFeedForCurrentUser = vi.fn();
const resolveRequestOrigin = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("@/lib/calendar/feedStore", () => ({ getCalendarFeedForCurrentUser }));
vi.mock("@/lib/calendar/requestOrigin", () => ({ resolveRequestOrigin }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/calendar/CalendarSyncSection", () => ({
  CalendarSyncSection: ({ initialEnabled, initialLinks }: { initialEnabled: boolean; initialLinks: { url: string } | null }) => (
    <div data-testid="calendar-sync-section">
      {initialEnabled ? "enabled" : "disabled"}
      {initialLinks ? `:${initialLinks.url}` : ""}
    </div>
  ),
}));

const { default: SettingsPage } = await import("./page");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  resolveRequestOrigin.mockResolvedValue("https://mi-ma-mo.app");
});

const OK_PERSON = { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null };

describe("SettingsPage — access control", () => {
  it("redirects to /login for an unauthenticated visitor", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unauthenticated" });
    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("shows the access-denied screen for an unmapped identity, never the calendar section", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unmapped" });
    render(await SettingsPage());
    expect(screen.queryByTestId("calendar-sync-section")).toBeNull();
  });
});

describe("SettingsPage — renders regardless of shift-schedule configuration", () => {
  it("renders the calendar sync section on a normal 'ok' result", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: { person: OK_PERSON },
      avatarUrl: null,
    });
    getCalendarFeedForCurrentUser.mockResolvedValue({ enabled: false, token: null });

    render(await SettingsPage());
    expect(screen.getByTestId("calendar-sync-section")).toHaveTextContent("disabled");
  });

  it("still renders the calendar sync section on 'configuration_error' -- sync doesn't depend on shift-schedule config", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "boom",
      person: OK_PERSON,
      avatarUrl: null,
    });
    getCalendarFeedForCurrentUser.mockResolvedValue({ enabled: false, token: null });

    render(await SettingsPage());
    expect(screen.getByTestId("calendar-sync-section")).toBeInTheDocument();
  });
});

describe("SettingsPage — initial calendar feed state", () => {
  it("passes enabled + built links through when a feed already exists", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "ok", model: { person: OK_PERSON }, avatarUrl: null });
    getCalendarFeedForCurrentUser.mockResolvedValue({ enabled: true, token: "tok-1" });

    render(await SettingsPage());
    expect(screen.getByTestId("calendar-sync-section")).toHaveTextContent(
      "enabled:https://mi-ma-mo.app/calendar/tok-1.ics",
    );
  });

  it("passes null links when no feed exists yet", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "ok", model: { person: OK_PERSON }, avatarUrl: null });
    getCalendarFeedForCurrentUser.mockResolvedValue({ enabled: false, token: null });

    render(await SettingsPage());
    expect(screen.getByTestId("calendar-sync-section")).toHaveTextContent("disabled");
  });
});
