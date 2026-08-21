import { afterEach, describe, expect, it, vi } from "vitest";

const fetchRawWorkbookSnapshot = vi.fn();
const parsePersonnelSheet = vi.fn();

vi.mock("@/lib/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google")>("@/lib/google");
  return { ...actual, fetchRawWorkbookSnapshot };
});
vi.mock("@/lib/parsers/personnel", () => ({ parsePersonnelSheet: (...args: unknown[]) => parsePersonnelSheet(...args) }));

async function loadModule() {
  return import("./freshRead");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("fetchFreshPersonnelRead -- the dedicated scheduled worker's narrow fresh read", () => {
  it("fetches ONLY the personnel source, never schedule/settings", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-21T17:32:00.000Z",
      sheets: [{ name: 'כ"א', values: [] }],
    });
    const people = [{ id: "p_1", name: "אחד" }];
    parsePersonnelSheet.mockReturnValue(people);

    const { fetchFreshPersonnelRead } = await loadModule();
    const result = await fetchFreshPersonnelRead();

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledWith(["personnel"]);
    expect(parsePersonnelSheet).toHaveBeenCalledWith({ name: 'כ"א', values: [] });
    expect(result).toEqual({ people, fetchedAt: "2026-08-21T17:32:00.000Z" });
  });

  it("throws if the personnel sheet is somehow missing from the snapshot -- same fail-closed behavior as fetchFreshWorkbookRead", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-21T17:32:00.000Z", sheets: [] });

    const { fetchFreshPersonnelRead } = await loadModule();

    await expect(fetchFreshPersonnelRead()).rejects.toThrow(/missing/i);
    expect(parsePersonnelSheet).not.toHaveBeenCalled();
  });
});
