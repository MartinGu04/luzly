import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";
import type { ScheduledBroadcastView } from "@/lib/notifications/scheduledBroadcastActions";

const composerProps = vi.fn();
const scheduledProps = vi.fn();
const recentProps = vi.fn();
const fixedNotificationsProps = vi.fn();

vi.mock("./ManagerBroadcastComposer", () => ({
  ManagerBroadcastComposer: (props: Record<string, unknown>) => {
    composerProps(props);
    return (
      <div data-testid="composer">
        <button type="button" onClick={() => (props.onSaved as () => void)()}>
          fake-save
        </button>
      </div>
    );
  },
}));

vi.mock("./ManagerScheduledBroadcastsSection", () => ({
  ManagerScheduledBroadcastsSection: (props: Record<string, unknown>) => {
    scheduledProps(props);
    return (
      <div data-testid="scheduled">
        <button type="button" onClick={() => (props.onEdit as (item: ScheduledBroadcastView) => void)(FAKE_ITEM)}>
          fake-edit
        </button>
        <button type="button" onClick={() => (props.onChanged as () => void)()}>
          fake-changed
        </button>
      </div>
    );
  },
}));

vi.mock("./ManagerRecentBroadcastsSection", () => ({
  ManagerRecentBroadcastsSection: (props: Record<string, unknown>) => {
    recentProps(props);
    return <div data-testid="recent" />;
  },
}));

vi.mock("./ManagerFixedNotificationsSection", () => ({
  ManagerFixedNotificationsSection: (props: Record<string, unknown>) => {
    fixedNotificationsProps(props);
    return <div data-testid="fixed-notifications" />;
  },
}));

const { ManagerBroadcastArea } = await import("./ManagerBroadcastArea");

const FAKE_ITEM: ScheduledBroadcastView = {
  id: "sb_1",
  status: "scheduled",
  audienceKind: "person",
  targetPersonIds: ["p_a"],
  title: "כותרת",
  body: "תוכן",
  scheduledFor: "2026-08-23T17:00:00.000Z",
  scheduledLocalDate: "2026-08-23",
  scheduledLocalMinuteOfDay: 20 * 60,
  createdByPersonName: "דני מנהל",
  lastChangedByPersonName: null,
};

const ROSTER: ManagerPersonSummary[] = [];
const ADOPTION: ManagerAdoptionPersonView[] = [];

afterEach(() => {
  cleanup();
  composerProps.mockReset();
  scheduledProps.mockReset();
  recentProps.mockReset();
  fixedNotificationsProps.mockReset();
});

describe("ManagerBroadcastArea -- wiring between the composer and its two list sections", () => {
  it("starts with no item being edited", () => {
    render(<ManagerBroadcastArea roster={ROSTER} adoptionPeople={ADOPTION} />);
    expect(composerProps.mock.calls.at(-1)?.[0].editingItem).toBeNull();
  });

  it("'עריכה' in the scheduled list populates the composer's editingItem", () => {
    render(<ManagerBroadcastArea roster={ROSTER} adoptionPeople={ADOPTION} />);
    fireEvent.click(screen.getByText("fake-edit"));
    expect(composerProps.mock.calls.at(-1)?.[0].editingItem).toEqual(FAKE_ITEM);
  });

  it("the composer's onCancelEdit clears editingItem back to null", () => {
    render(<ManagerBroadcastArea roster={ROSTER} adoptionPeople={ADOPTION} />);
    fireEvent.click(screen.getByText("fake-edit"));
    expect(composerProps.mock.calls.at(-1)?.[0].editingItem).toEqual(FAKE_ITEM);

    act(() => {
      (composerProps.mock.calls.at(-1)?.[0].onCancelEdit as () => void)();
    });
    expect(composerProps.mock.calls.at(-1)?.[0].editingItem).toBeNull();
  });

  it("a successful save bumps BOTH the scheduled and recent reload tokens", () => {
    render(<ManagerBroadcastArea roster={ROSTER} adoptionPeople={ADOPTION} />);
    const scheduledTokenBefore = scheduledProps.mock.calls.at(-1)?.[0].reloadToken;
    const recentTokenBefore = recentProps.mock.calls.at(-1)?.[0].reloadToken;

    fireEvent.click(screen.getByText("fake-save"));

    expect(scheduledProps.mock.calls.at(-1)?.[0].reloadToken).toBe(scheduledTokenBefore + 1);
    expect(recentProps.mock.calls.at(-1)?.[0].reloadToken).toBe(recentTokenBefore + 1);
  });

  it("a send-now/cancel in the scheduled list (onChanged) also bumps both tokens", () => {
    render(<ManagerBroadcastArea roster={ROSTER} adoptionPeople={ADOPTION} />);
    const scheduledTokenBefore = scheduledProps.mock.calls.at(-1)?.[0].reloadToken;
    const recentTokenBefore = recentProps.mock.calls.at(-1)?.[0].reloadToken;

    fireEvent.click(screen.getByText("fake-changed"));

    expect(scheduledProps.mock.calls.at(-1)?.[0].reloadToken).toBe(scheduledTokenBefore + 1);
    expect(recentProps.mock.calls.at(-1)?.[0].reloadToken).toBe(recentTokenBefore + 1);
  });

  it("starts with the recent section's polling gated off (no active schedules reported yet)", () => {
    render(<ManagerBroadcastArea roster={ROSTER} adoptionPeople={ADOPTION} />);
    expect(recentProps.mock.calls.at(-1)?.[0].pollWhileActive).toBe(false);
  });

  it("the scheduled section's onActiveChange(true) turns on the recent section's pollWhileActive (spec §7)", () => {
    render(<ManagerBroadcastArea roster={ROSTER} adoptionPeople={ADOPTION} />);

    act(() => {
      (scheduledProps.mock.calls.at(-1)?.[0].onActiveChange as (active: boolean) => void)(true);
    });
    expect(recentProps.mock.calls.at(-1)?.[0].pollWhileActive).toBe(true);

    act(() => {
      (scheduledProps.mock.calls.at(-1)?.[0].onActiveChange as (active: boolean) => void)(false);
    });
    expect(recentProps.mock.calls.at(-1)?.[0].pollWhileActive).toBe(false);
  });

  it("renders the Fixed Notifications Center section with the same roster/adoptionPeople props", () => {
    render(<ManagerBroadcastArea roster={ROSTER} adoptionPeople={ADOPTION} />);
    expect(screen.getByTestId("fixed-notifications")).toBeTruthy();
    expect(fixedNotificationsProps.mock.calls.at(-1)?.[0]).toEqual({ roster: ROSTER, adoptionPeople: ADOPTION });
  });
});
