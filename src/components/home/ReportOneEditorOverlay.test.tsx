import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReportOneDraft } from "@/lib/domain/reportOne";
import { ReportOneEditorOverlay } from "./ReportOneEditorOverlay";

function draft(): ReportOneDraft {
  return {
    targetDate: "2026-08-26",
    sections: [
      { section: "permanent", label: "אנשי קבע💛:", people: [{ personId: "p_1", name: "עמנואל צגה", section: "permanent", generatedStatus: "?" }] },
      { section: "reserve", label: "מילואים😍:", people: [] },
      {
        section: "regular_manager",
        label: 'סדיר - אחמשים🧑🏻‍💻:',
        people: [{ personId: "p_2", name: "עילאי שפירא", section: "regular_manager", generatedStatus: 'נוכח, אחמ"ש יום' }],
      },
      { section: "regular_technician", label: 'סדיר - טכנאים🧑🏻‍🔧:', people: [] },
    ],
  };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ReportOneEditorOverlay", () => {
  it("renders every person's name and generated status as an editable row", () => {
    render(<ReportOneEditorOverlay draft={draft()} onClose={() => {}} />);
    expect(screen.getByText("עמנואל צגה")).toBeInTheDocument();
    expect(screen.getByDisplayValue("?")).toBeInTheDocument();
    expect(screen.getByDisplayValue('נוכח, אחמ"ש יום')).toBeInTheDocument();
  });

  it("23. manual edits remain in the field until Reset", () => {
    render(<ReportOneEditorOverlay draft={draft()} onClose={() => {}} />);
    const input = screen.getByLabelText("סטטוס עבור עמנואל צגה");
    fireEvent.change(input, { target: { value: "נוכח, מגיע בערב" } });
    expect(screen.getByDisplayValue("נוכח, מגיע בערב")).toBeInTheDocument();
  });

  it("24. Reset restores the generated value after a manual edit, with an inline confirm since edits exist", () => {
    render(<ReportOneEditorOverlay draft={draft()} onClose={() => {}} />);
    const input = screen.getByLabelText("סטטוס עבור עמנואל צגה");
    fireEvent.change(input, { target: { value: "נוכח, מגיע בערב" } });

    fireEvent.click(screen.getByRole("button", { name: /איפוס לטיוטה האוטומטית/ }));
    expect(screen.getByText(/קיימים שינויים ידניים/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "אישור" }));
    expect(screen.getByLabelText("סטטוס עבור עמנואל צגה")).toHaveValue("?");
  });

  it("reset with no unsaved edits skips the confirmation entirely", () => {
    render(<ReportOneEditorOverlay draft={draft()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /איפוס לטיוטה האוטומטית/ }));
    expect(screen.queryByText(/קיימים שינויים ידניים/)).toBeNull();
  });

  it("copying writes the formatted report (including any manual edits) to the clipboard and shows feedback", async () => {
    render(<ReportOneEditorOverlay draft={draft()} onClose={() => {}} />);
    const input = screen.getByLabelText("סטטוס עבור עמנואל צגה");
    fireEvent.change(input, { target: { value: "נוכח, מגיע בערב" } });

    fireEvent.click(screen.getByRole("button", { name: /העתק דוח/ }));

    await waitFor(() => expect(screen.getByText("הדוח הועתק")).toBeInTheDocument());
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("עמנואל צגה - נוכח, מגיע בערב"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("דוח 1: 26/08/2026🛰️"));
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<ReportOneEditorOverlay draft={draft()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
