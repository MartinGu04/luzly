import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PermanentManagerHomeCurrentShift, PermanentManagerHomeShift } from "@/lib/readModels/permanentManagerHomeTypes";
import { ShiftSnapshotCard } from "./ShiftSnapshotCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const FETCHED_AT = "2026-08-12T08:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FETCHED_AT));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function baseShift(overrides: Partial<PermanentManagerHomeShift> = {}): PermanentManagerHomeShift {
  return {
    date: "2026-08-12",
    period: "day",
    startLocalTime: "07:30",
    endLocalTime: "19:30",
    supervisors: [],
    technicians: [],
    coverageStatus: "full",
    missingIntervals: [],
    roleCoverage: {
      technician: { status: "full", missingIntervals: [] },
      supervisor: { status: "full", missingIntervals: [] },
    },
    ...overrides,
  };
}

const RESOLVED_TIMING: PermanentManagerHomeCurrentShift["timing"] = {
  status: "resolved",
  startLocalTime: "07:30",
  endLocalTime: "19:30",
  durationMinutes: 720,
  elapsedMinutesAtLoad: 30,
  remainingMinutesAtLoad: 690,
  progressPercentAtLoad: 4,
  minutesUntilStartAtLoad: 0,
};

describe("ShiftSnapshotCard — content", () => {
  it("renders the period, date and canonical hours", () => {
    render(<ShiftSnapshotCard label="הקודמת" shift={baseShift()} todayDate="2026-08-12" />);
    expect(screen.getByText("יום")).toBeInTheDocument();
    expect(screen.getByText("הקודמת")).toBeInTheDocument();
    expect(screen.getByText(/07:30/)).toBeInTheDocument();
    expect(screen.getByText(/19:30/)).toBeInTheDocument();
  });

  it("renders assigned supervisors and technicians grouped by operational role", () => {
    const shift = baseShift({
      supervisors: [{ personId: "p_sup", personName: "טוביה כהן", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null }],
      technicians: [
        { personId: "p_t1", personName: "איתי אוליר", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null },
        { personId: "p_t2", personName: "עילאי שפירא", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null },
      ],
    });
    render(<ShiftSnapshotCard label="המשמרת עכשיו" shift={shift} todayDate="2026-08-12" />);
    expect(screen.getByText("טוביה כהן")).toBeInTheDocument();
    expect(screen.getByText("איתי אוליר · עילאי שפירא")).toBeInTheDocument();
  });

  it("a long name renders in full as text content (layout truncation is CSS-only, never a data cutoff)", () => {
    const longName = "אברהם יצחק יעקב בן שלמה הכהן הלוי מהעיר הגדולה";
    const shift = baseShift({
      supervisors: [{ personId: "p_sup", personName: longName, certainty: "confirmed", startTimeOverride: null, endTimeOverride: null }],
    });
    render(<ShiftSnapshotCard label="הקודמת" shift={shift} todayDate="2026-08-12" />);
    expect(screen.getByText(longName)).toBeInTheDocument();
  });
});

describe("ShiftSnapshotCard — coverage", () => {
  it("full coverage renders no role-coverage warning and no /manager affordance", () => {
    render(<ShiftSnapshotCard label="הקודמת" shift={baseShift({ coverageStatus: "full" })} todayDate="2026-08-12" />);
    expect(screen.queryByText(/חסר/)).toBeNull();
    expect(screen.queryByText(/דורש טיפול/)).toBeNull();
  });

  it("missing supervisor renders the explicit role message and a /manager affordance", () => {
    const shift = baseShift({
      coverageStatus: "missing",
      roleCoverage: {
        technician: { status: "full", missingIntervals: [] },
        supervisor: { status: "missing", missingIntervals: [{ startMinute: 450, endMinute: 1170 }] },
      },
    });
    render(<ShiftSnapshotCard label="המשמרת עכשיו" shift={shift} todayDate="2026-08-12" />);
    expect(screen.getByText('חסר אחמ"ש')).toBeInTheDocument();
    const link = screen.getByRole("link");
    // Links to the Manager Area's default Overview category ("דורש טיפול"
    // already surfaces this exact coverage gap as an issue) -- the old
    // problems=1 toggle no longer exists.
    expect(link.getAttribute("href")).toBe("/manager?range=today");
  });

  it("partial coverage renders the explicit interval message", () => {
    const shift = baseShift({
      coverageStatus: "partial",
      roleCoverage: {
        technician: { status: "partial", missingIntervals: [{ startMinute: 720, endMinute: 1170 }] },
        supervisor: { status: "full", missingIntervals: [] },
      },
    });
    render(<ShiftSnapshotCard label="הקודמת" shift={shift} todayDate="2026-08-12" />);
    expect(screen.getByText(/כיסוי טכנאי חלקי/)).toBeInTheDocument();
  });

  it("not_evaluable coverage never claims a gap, and never shows the /manager affordance", () => {
    const shift = baseShift({
      coverageStatus: "not_evaluable",
      roleCoverage: {
        technician: { status: "not_evaluable", missingIntervals: [] },
        supervisor: { status: "not_evaluable", missingIntervals: [] },
      },
    });
    render(<ShiftSnapshotCard label="הקודמת" shift={shift} todayDate="2026-08-12" />);
    expect(screen.queryByText(/חסר/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("empty staffing (no one assigned at all) renders the missing-role messages, not a silent empty card", () => {
    const shift = baseShift({
      coverageStatus: "missing",
      supervisors: [],
      technicians: [],
      roleCoverage: {
        technician: { status: "missing", missingIntervals: [{ startMinute: 450, endMinute: 1170 }] },
        supervisor: { status: "missing", missingIntervals: [{ startMinute: 450, endMinute: 1170 }] },
      },
    });
    render(<ShiftSnapshotCard label="המשמרת עכשיו" shift={shift} todayDate="2026-08-12" />);
    expect(screen.getByText('חסר אחמ"ש')).toBeInTheDocument();
    expect(screen.getByText("חסר טכנאי")).toBeInTheDocument();
  });
});

describe("ShiftSnapshotCard — live progress reuses ShiftProgress", () => {
  it("the current variant renders an accessible progressbar driven by the server-computed timing", () => {
    render(
      <ShiftSnapshotCard
        label="המשמרת עכשיו"
        shift={baseShift()}
        todayDate="2026-08-12"
        current={{ timing: RESOLVED_TIMING, fetchedAt: "2026-08-12T08:00:00.000Z" }}
      />,
    );
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "4");
  });

  it("previous/next (non-current) never render a progress bar", () => {
    render(<ShiftSnapshotCard label="הקודמת" shift={baseShift()} todayDate="2026-08-12" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
