import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";
import type { RawSheet } from "@/lib/google";

const getAuthenticatedIdentity = vi.fn();
const fetchRawWorkbookSnapshot = vi.fn();

vi.mock("./currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/google", () => ({ fetchRawWorkbookSnapshot }));

const { findPersonByEmail, resolveCurrentPerson } = await import("./resolveCurrentPerson");

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_1",
    name: "דני בדיקה",
    email: "dani@example.invalid",
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

function personnelSheet(rows: string[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}

describe("findPersonByEmail (pure)", () => {
  it("2. resolves the matching Person by exact email", () => {
    const p = person();
    expect(findPersonByEmail([p], "dani@example.invalid")).toBe(p);
  });

  it("3. email matching is case-insensitive", () => {
    const p = person({ email: "Dani@Example.Invalid" });
    expect(findPersonByEmail([p], "dani@example.invalid")).toBe(p);
    expect(findPersonByEmail([p], "DANI@EXAMPLE.INVALID")).toBe(p);
  });

  it("4. email matching trims surrounding whitespace on both sides", () => {
    const p = person({ email: "dani@example.invalid" });
    expect(findPersonByEmail([p], "  dani@example.invalid  ")).toBe(p);

    const p2 = person({ id: "p_2", email: "  noa@example.invalid  " });
    expect(findPersonByEmail([p2], "noa@example.invalid")).toBe(p2);
  });

  it("an unmapped email returns null", () => {
    const p = person();
    expect(findPersonByEmail([p], "someone-else@example.invalid")).toBeNull();
  });

  it("7. manager property comes from Person, not a hardcoded allowlist", () => {
    const manager = person({ email: "manager@example.invalid", isManager: true });
    const found = findPersonByEmail([manager], "manager@example.invalid");
    expect(found?.isManager).toBe(true);

    const nonManager = person({ email: "tech@example.invalid", isManager: false });
    const found2 = findPersonByEmail([nonManager], "tech@example.invalid");
    expect(found2?.isManager).toBe(false);
  });

  it("8. technician/supervisor capabilities are preserved", () => {
    const p = person({ email: "x@example.invalid", isTechnician: true, isSupervisor: true });
    const found = findPersonByEmail([p], "x@example.invalid");
    expect(found).toMatchObject({ isTechnician: true, isSupervisor: true });
  });

  it("9. name similarity never grants access when the email does not match", () => {
    const p = person({ name: "דני בדיקה", email: "dani@example.invalid" });
    expect(findPersonByEmail([p], "דני בדיקה")).toBeNull();
    expect(findPersonByEmail([p], "different-person@example.invalid")).toBeNull();
  });

  it("does not match a Person with a null email", () => {
    const p = person({ email: null });
    expect(findPersonByEmail([p], "")).toBeNull();
  });

  it("18. duplicate-case emails in the personnel list resolve deterministically", () => {
    const first = person({ id: "p_1", email: "shared@example.invalid" });
    const second = person({ id: "p_2", email: "SHARED@example.invalid" });
    expect(findPersonByEmail([first, second], "shared@example.invalid")).toBe(first);
    expect(findPersonByEmail([first, second], "shared@example.invalid")).toBe(first);
  });

  it("17. does not mutate any Person object", () => {
    const p = Object.freeze(person());
    expect(() => findPersonByEmail([p], "dani@example.invalid")).not.toThrow();
    expect(p.email).toBe("dani@example.invalid");
  });
});

describe("resolveCurrentPerson (orchestration, mocked identity + Google layer)", () => {
  beforeEach(() => {
    getAuthenticatedIdentity.mockReset();
    fetchRawWorkbookSnapshot.mockReset();
  });

  it("returns unauthenticated when there is no authenticated identity, without fetching anything", async () => {
    getAuthenticatedIdentity.mockResolvedValue(null);
    const result = await resolveCurrentPerson();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("1. authenticated user with a matching personnel email resolves the Person", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ userId: "u1", email: "dani@example.invalid" });
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      sheets: [personnelSheet([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]])],
    });

    const result = await resolveCurrentPerson();

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.person.name).toBe("דני בדיקה");
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledWith(["personnel"]);
  });

  it("5. authenticated but unmapped email is denied", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ userId: "u1", email: "stranger@example.invalid" });
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      sheets: [personnelSheet([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]])],
    });

    const result = await resolveCurrentPerson();

    expect(result).toEqual({ status: "unmapped", email: "stranger@example.invalid" });
  });

  it("6. propagates the no-usable-email denial from identity resolution, never fetching personnel", async () => {
    getAuthenticatedIdentity.mockResolvedValue(null);
    const result = await resolveCurrentPerson();
    expect(result.status).toBe("unauthenticated");
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("10. resolveCurrentPerson takes no arguments -- there is no way to pass a client-supplied email in", async () => {
    expect(resolveCurrentPerson.length).toBe(0);
    getAuthenticatedIdentity.mockResolvedValue({ userId: "u1", email: "dani@example.invalid" });
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      sheets: [personnelSheet([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]])],
    });
    const result = await resolveCurrentPerson();
    expect(result.status).toBe("ok");
  });
});
