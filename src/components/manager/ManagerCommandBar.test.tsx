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

const CURRENT: ManagerHrefParams = { personId: null, range: "7d", month: null, category: "overview" };
const PEOPLE = [{ id: "p1", name: "מרטין בדיקה", personnelType: null, isSupervisor: false, isTechnician: false }];

describe("ManagerCommandBar", () => {
  it("renders the person selector, range selector, and freshness status", () => {
    render(
      <ManagerCommandBar people={PEOPLE} selectedPersonId={null} current={CURRENT} currentMonth={null} fetchedAt="2026-08-14T08:00:00.000Z" />,
    );
    expect(screen.getByRole("button")).toHaveTextContent("כולם");
    expect(screen.getByRole("navigation", { name: "טווח תאריכים" })).toBeInTheDocument();
    expect(screen.getByTestId("freshness")).toHaveTextContent("2026-08-14T08:00:00.000Z");
  });

  it("never renders a problems-only action -- Overview owns that job now", () => {
    render(
      <ManagerCommandBar people={PEOPLE} selectedPersonId={null} current={CURRENT} currentMonth={null} fetchedAt="2026-08-14T08:00:00.000Z" />,
    );
    expect(screen.queryByRole("link", { name: "הצג רק בעיות" })).toBeNull();
    expect(screen.queryByRole("link", { name: "מציג רק בעיות" })).toBeNull();
  });

  it("still renders the range selector on a selected-person view", () => {
    render(
      <ManagerCommandBar
        people={PEOPLE}
        selectedPersonId="p1"
        current={{ ...CURRENT, personId: "p1" }}
        currentMonth={null}
        fetchedAt="2026-08-14T08:00:00.000Z"
      />,
    );
    expect(screen.getByRole("navigation", { name: "טווח תאריכים" })).toBeInTheDocument();
  });
});
