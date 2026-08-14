import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerCommandBar } from "./ManagerCommandBar";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/DataFreshnessStatus", () => ({
  DataFreshnessStatus: ({ fetchedAt }: { fetchedAt: string }) => <div data-testid="freshness">{fetchedAt}</div>,
}));

afterEach(() => {
  cleanup();
});

const CURRENT: ManagerHrefParams = { personId: null, range: "7d", month: null, problemsOnly: false };
const PEOPLE = [{ id: "p1", name: "מרטין בדיקה" }];

describe("ManagerCommandBar", () => {
  it("renders the person selector, range selector, and freshness status", () => {
    render(
      <ManagerCommandBar
        people={PEOPLE}
        selectedPersonId={null}
        current={CURRENT}
        currentMonth={null}
        fetchedAt="2026-08-14T08:00:00.000Z"
        showProblemsToggle
      />,
    );
    expect(screen.getByRole("button")).toHaveTextContent("כולם");
    expect(screen.getByRole("navigation", { name: "טווח תאריכים" })).toBeInTheDocument();
    expect(screen.getByTestId("freshness")).toHaveTextContent("2026-08-14T08:00:00.000Z");
  });

  it("shows the problems-only action when showProblemsToggle is true", () => {
    render(
      <ManagerCommandBar
        people={PEOPLE}
        selectedPersonId={null}
        current={CURRENT}
        currentMonth={null}
        fetchedAt="2026-08-14T08:00:00.000Z"
        showProblemsToggle
      />,
    );
    expect(screen.getByRole("link", { name: "הצג רק בעיות" })).toBeInTheDocument();
  });

  it("hides the problems-only action on the selected-person view (showProblemsToggle=false) -- never a fake/nonfunctional toggle", () => {
    render(
      <ManagerCommandBar
        people={PEOPLE}
        selectedPersonId="p1"
        current={{ ...CURRENT, personId: "p1" }}
        currentMonth={null}
        fetchedAt="2026-08-14T08:00:00.000Z"
        showProblemsToggle={false}
      />,
    );
    expect(screen.queryByRole("link", { name: "הצג רק בעיות" })).toBeNull();
    expect(screen.queryByRole("link", { name: "מציג רק בעיות" })).toBeNull();
  });
});
