import { describe, expect, it } from "vitest";
import type { ManagerAdoptionPersonView, ManagerAdoptionState, ManagerAdoptionView } from "@/lib/readModels/managerTypes";
import { buildManagerAdoptionSectionView } from "./managerAdoption";

function personView(overrides: Partial<ManagerAdoptionPersonView> & Pick<ManagerAdoptionPersonView, "personId" | "personName">): ManagerAdoptionPersonView {
  return {
    avatarUrl: null,
    loginStatus: null,
    notificationStatus: null,
    dataIssue: null,
    needsNudge: false,
    ...overrides,
  };
}

function summaryFor(people: ManagerAdoptionPersonView[]): ManagerAdoptionView["summary"] {
  return {
    totalCount: people.length,
    loggedInCount: people.filter((p) => p.loginStatus === "logged_in").length,
    notLoggedInCount: people.filter((p) => p.loginStatus === "not_logged_in").length,
    notificationReadyCount: people.filter((p) => p.notificationStatus === "ready").length,
    loggedInNotReadyCount: people.filter((p) => p.notificationStatus === "not_enabled").length,
    dataIssueCount: people.filter((p) => p.dataIssue !== null).length,
  };
}

function available(people: ManagerAdoptionPersonView[]): ManagerAdoptionState {
  return { status: "available", view: { summary: summaryFor(people), people } };
}

describe("buildManagerAdoptionSectionView — three distinct states", () => {
  it("skipped -- hidden (the lookup was never attempted)", () => {
    expect(buildManagerAdoptionSectionView({ status: "skipped" })).toEqual({ kind: "hidden" });
  });

  it("unavailable -- its own distinct kind, never hidden and never conflated with all-ready", () => {
    expect(buildManagerAdoptionSectionView({ status: "unavailable" })).toEqual({ kind: "unavailable" });
  });

  it("available with everyone ready -- STILL renders (unlike the old מצב התראות aside), since this is a full category page", () => {
    const people = [personView({ personId: "p1", personName: "דנה", loginStatus: "logged_in", notificationStatus: "ready" })];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result.kind).toBe("available");
  });
});

describe("buildManagerAdoptionSectionView — headline + stats", () => {
  it("headline states X out of Y logged in", () => {
    const people = [
      personView({ personId: "p1", personName: "דנה", loginStatus: "logged_in", notificationStatus: "ready" }),
      personView({ personId: "p2", personName: "עידו", loginStatus: "not_logged_in", needsNudge: true }),
    ];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result).toMatchObject({ kind: "available", headline: "1 מתוך 2 כבר נכנסו למערכת" });
  });

  it("empty roster gets a calm empty-state headline, never a fabricated 0 מתוך 0", () => {
    const result = buildManagerAdoptionSectionView(available([]));
    expect(result).toMatchObject({ kind: "available", headline: "אין אנשי צוות להצגה." });
  });

  it("every stat maps to a real, non-decorative count", () => {
    const people = [
      personView({ personId: "p1", personName: "דנה", loginStatus: "logged_in", notificationStatus: "ready" }),
      personView({ personId: "p2", personName: "עידו", loginStatus: "logged_in", notificationStatus: "not_enabled" }),
      personView({ personId: "p3", personName: "רון", loginStatus: "not_logged_in" }),
      personView({ personId: "p4", personName: "מאיה", dataIssue: "missing_email" }),
    ];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.stats).toEqual([
      { label: "סה״כ אנשי צוות", value: 4 },
      { label: "נכנסו למערכת", value: 2 },
      { label: "טרם נכנסו", value: 1 },
      { label: "מוכנים לקבל התראות", value: 1 },
      { label: "נכנסו, התראות לא פעילות", value: 1 },
      { label: "בעיית נתונים בכ״א", value: 1 },
    ]);
  });
});

describe("buildManagerAdoptionSectionView — grouping", () => {
  it("splits people into the four groups by loginStatus/notificationStatus/dataIssue", () => {
    const people = [
      personView({ personId: "p1", personName: "דנה", loginStatus: "logged_in", notificationStatus: "ready" }),
      personView({ personId: "p2", personName: "עידו", loginStatus: "logged_in", notificationStatus: "not_enabled" }),
      personView({ personId: "p3", personName: "רון", loginStatus: "not_logged_in" }),
      personView({ personId: "p4", personName: "מאיה", dataIssue: "ambiguous_email" }),
    ];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;

    expect(result.notLoggedInGroup.people.map((p) => p.personName)).toEqual(["רון"]);
    expect(result.notificationsOffGroup.people.map((p) => p.personName)).toEqual(["עידו"]);
    expect(result.readyGroup.people.map((p) => p.personName)).toEqual(["דנה"]);
    expect(result.dataIssueGroup.people.map((p) => p.personName)).toEqual(["מאיה"]);
  });

  it("an empty group still renders as a real group with an empty people array (component decides whether to hide it)", () => {
    const people = [personView({ personId: "p1", personName: "דנה", loginStatus: "logged_in", notificationStatus: "ready" })];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.notLoggedInGroup.people).toEqual([]);
    expect(result.dataIssueGroup.people).toEqual([]);
  });

  it("dataIssueGroup rows carry the exact issue label, distinct per issue type", () => {
    const people = [
      personView({ personId: "p1", personName: "דנה", dataIssue: "missing_email" }),
      personView({ personId: "p2", personName: "עידו", dataIssue: "ambiguous_email" }),
    ];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.dataIssueGroup.people).toEqual([
      { personId: "p1", personName: "דנה", avatarUrl: null, issueLabel: "חסר מייל בכ״א" },
      { personId: "p2", personName: "עידו", avatarUrl: null, issueLabel: "מייל משויך ליותר מאדם אחד" },
    ]);
  });

  it("non-data-issue rows never carry an issueLabel", () => {
    const people = [personView({ personId: "p1", personName: "דנה", loginStatus: "logged_in", notificationStatus: "ready" })];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.readyGroup.people[0].issueLabel).toBeNull();
  });

  it("carries avatarUrl through for a logged-in person, untouched", () => {
    const people = [
      personView({
        personId: "p1",
        personName: "דנה",
        loginStatus: "logged_in",
        notificationStatus: "ready",
        avatarUrl: "https://example.invalid/dana.jpg",
      }),
    ];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.readyGroup.people[0].avatarUrl).toBe("https://example.invalid/dana.jpg");
  });

  it("never exposes needsNudge, loginStatus, or notificationStatus in the built row -- only personId/personName/avatarUrl/issueLabel", () => {
    const people = [personView({ personId: "p1", personName: "דנה", loginStatus: "not_logged_in", needsNudge: true })];
    const result = buildManagerAdoptionSectionView(available(people));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.notLoggedInGroup.people[0]).toEqual({
      personId: "p1",
      personName: "דנה",
      avatarUrl: null,
      issueLabel: null,
    });
  });
});
