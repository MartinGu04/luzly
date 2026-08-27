import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";
import type { ScheduledBroadcastView } from "@/lib/notifications/scheduledBroadcastActions";

const composerProps = vi.fn();
const scheduledProps = vi.fn();

vi.mock("@/components/manager/ManagerBroadcastComposer", () => ({
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

vi.mock("@/components/manager/ManagerScheduledBroadcastsSection", () => ({
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

const { NotificationScheduleSection } = await import("./NotificationScheduleSection");

const FAKE_ITEM: ScheduledBroadcastView = {
  id: "sb_1",
  status: "scheduled",
  audienceKind: "person",
  targetPersonIds: ["p_a"],
  audienceGroupKeys: [],
  excludedPersonIds: [],
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
});

describe("NotificationScheduleSection -- wiring between the composer and the scheduled list", () => {
  it("fixes the composer's mode to 'schedule'", () => {
    render(<NotificationScheduleSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    expect(composerProps.mock.calls.at(-1)?.[0].mode).toBe("schedule");
  });

  it("passes the given roster/adoptionPeople straight through to both the composer and the scheduled list", () => {
    render(<NotificationScheduleSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    expect(composerProps.mock.calls.at(-1)?.[0]).toMatchObject({ roster: ROSTER, adoptionPeople: ADOPTION });
  });

  it("starts with no item being edited", () => {
    render(<NotificationScheduleSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    expect(composerProps.mock.calls.at(-1)?.[0].editingItem).toBeNull();
  });

  it("'עריכה' in the scheduled list populates the composer's editingItem", () => {
    render(<NotificationScheduleSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    fireEvent.click(screen.getByText("fake-edit"));
    expect(composerProps.mock.calls.at(-1)?.[0].editingItem).toEqual(FAKE_ITEM);
  });

  it("the composer's onCancelEdit clears editingItem back to null", () => {
    render(<NotificationScheduleSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    fireEvent.click(screen.getByText("fake-edit"));
    expect(composerProps.mock.calls.at(-1)?.[0].editingItem).toEqual(FAKE_ITEM);

    act(() => {
      (composerProps.mock.calls.at(-1)?.[0].onCancelEdit as () => void)();
    });
    expect(composerProps.mock.calls.at(-1)?.[0].editingItem).toBeNull();
  });

  it("a successful save bumps the scheduled list's reload token", () => {
    render(<NotificationScheduleSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    const tokenBefore = scheduledProps.mock.calls.at(-1)?.[0].reloadToken;

    fireEvent.click(screen.getByText("fake-save"));

    expect(scheduledProps.mock.calls.at(-1)?.[0].reloadToken).toBe(tokenBefore + 1);
  });

  it("a send-now/cancel in the scheduled list (onChanged) also bumps the reload token", () => {
    render(<NotificationScheduleSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    const tokenBefore = scheduledProps.mock.calls.at(-1)?.[0].reloadToken;

    fireEvent.click(screen.getByText("fake-changed"));

    expect(scheduledProps.mock.calls.at(-1)?.[0].reloadToken).toBe(tokenBefore + 1);
  });
});
