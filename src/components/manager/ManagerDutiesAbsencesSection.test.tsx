import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerDutiesAbsencesSection } from "./ManagerDutiesAbsencesSection";
import type { ManagerAbsenceRowView, ManagerDutyRowView } from "./types";

afterEach(() => {
  cleanup();
});

function duty(overrides: Partial<ManagerDutyRowView> = {}): ManagerDutyRowView {
  return {
    key: "k1",
    personName: "מרטין בדיקה",
    dateLabel: "היום",
    emoji: "🛡️",
    title: "שמירה 1",
    dutyFamily: "guard",
    ...overrides,
  };
}

function absence(overrides: Partial<ManagerAbsenceRowView> = {}): ManagerAbsenceRowView {
  return {
    key: "k1",
    personName: "מרטין בדיקה",
    dateLabel: "היום",
    emoji: "🏖️",
    label: "חופש",
    absenceKind: "vacation",
    ...overrides,
  };
}

describe("ManagerDutiesAbsencesSection", () => {
  it("shows an empty message when there are no duties or absences", () => {
    render(<ManagerDutiesAbsencesSection duties={[]} absences={[]} />);
    expect(screen.getByText("אין תורנויות או היעדרויות בטווח שנבחר.")).toBeInTheDocument();
  });

  it("groups שמירה 1 and שמירה 2 (same family, different slot) under one שמירה group", () => {
    render(
      <ManagerDutiesAbsencesSection
        duties={[
          duty({ key: "a", title: "שמירה 1", dutyFamily: "guard" }),
          duty({ key: "b", title: "שמירה 2", dutyFamily: "guard" }),
        ]}
        absences={[]}
      />,
    );
    expect(screen.getByRole("heading", { level: 4, name: /שמירה/ })).toBeInTheDocument();
    expect(screen.getByText("שמירה 1")).toBeInTheDocument();
    expect(screen.getByText("שמירה 2")).toBeInTheDocument();
    // The group heading shows a count of 2, proving it's one group, not two.
    expect(screen.getByText("· 2")).toBeInTheDocument();
  });

  it("keeps different duty families in separate groups", () => {
    render(
      <ManagerDutiesAbsencesSection
        duties={[duty({ key: "a", title: "שמירה 1", dutyFamily: "guard" }), duty({ key: "b", title: "אוקסיד", dutyFamily: "oxid" })]}
        absences={[]}
      />,
    );
    expect(screen.getByRole("heading", { level: 4, name: /שמירה/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /אוקסיד/ })).toBeInTheDocument();
  });

  it("groups absences by absenceKind", () => {
    render(
      <ManagerDutiesAbsencesSection
        duties={[]}
        absences={[
          absence({ key: "a", personName: "מרטין בדיקה", absenceKind: "vacation" }),
          absence({ key: "b", personName: "נועה דוגמה", absenceKind: "vacation" }),
          absence({ key: "c", personName: "איתן דוגמה", absenceKind: "medical" }),
        ]}
      />,
    );
    expect(screen.getByText("חופש")).toBeInTheDocument();
    expect(screen.getByText("גימלים")).toBeInTheDocument();
  });

  it("never renders an empty group -- only the תורנויות panel shows when there are no absences", () => {
    render(<ManagerDutiesAbsencesSection duties={[duty()]} absences={[]} />);
    expect(screen.getByText("תורנויות")).toBeInTheDocument();
    expect(screen.queryByText("היעדרויות")).toBeNull();
  });

  it("each row still shows person and date", () => {
    render(<ManagerDutiesAbsencesSection duties={[duty({ personName: "מרטין בדיקה", dateLabel: "היום" })]} absences={[]} />);
    expect(screen.getByText("מרטין בדיקה")).toBeInTheDocument();
    expect(screen.getByText("היום")).toBeInTheDocument();
  });
});
