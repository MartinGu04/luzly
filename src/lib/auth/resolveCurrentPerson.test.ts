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
  it("9. resolves the unique matching Person by exact email", () => {
    const p = person();
    expect(findPersonByEmail([p], "dani@example.invalid")).toEqual({ status: "found", person: p });
  });

  it("email matching is case-insensitive", () => {
    const p = person({ email: "Dani@Example.Invalid" });
    expect(findPersonByEmail([p], "dani@example.invalid")).toEqual({ status: "found", person: p });
    expect(findPersonByEmail([p], "DANI@EXAMPLE.INVALID")).toEqual({ status: "found", person: p });
  });

  it("email matching trims surrounding whitespace on both sides", () => {
    const p = person({ email: "dani@example.invalid" });
    expect(findPersonByEmail([p], "  dani@example.invalid  ")).toEqual({ status: "found", person: p });

    const p2 = person({ id: "p_2", email: "  noa@example.invalid  " });
    expect(findPersonByEmail([p2], "noa@example.invalid")).toEqual({ status: "found", person: p2 });
  });

  it("an unmapped email returns not_found", () => {
    const p = person();
    expect(findPersonByEmail([p], "someone-else@example.invalid")).toEqual({ status: "not_found" });
  });

  it("manager property comes from Person, not a hardcoded allowlist", () => {
    const manager = person({ email: "manager@example.invalid", isManager: true });
    const found = findPersonByEmail([manager], "manager@example.invalid");
    expect(found.status === "found" && found.person.isManager).toBe(true);

    const nonManager = person({ email: "tech@example.invalid", isManager: false });
    const found2 = findPersonByEmail([nonManager], "tech@example.invalid");
    expect(found2.status === "found" && found2.person.isManager).toBe(false);
  });

  it("technician/supervisor capabilities are preserved", () => {
    const p = person({ email: "x@example.invalid", isTechnician: true, isSupervisor: true });
    const found = findPersonByEmail([p], "x@example.invalid");
    expect(found.status === "found" && found.person).toMatchObject({
      isTechnician: true,
      isSupervisor: true,
    });
  });

  it("name similarity never grants access when the email does not match", () => {
    const p = person({ name: "דני בדיקה", email: "dani@example.invalid" });
    expect(findPersonByEmail([p], "דני בדיקה")).toEqual({ status: "not_found" });
    expect(findPersonByEmail([p], "different-person@example.invalid")).toEqual({ status: "not_found" });
  });

  it("does not match a Person with a null email", () => {
    const p = person({ email: null });
    expect(findPersonByEmail([p], "")).toEqual({ status: "not_found" });
  });

  it("does not mutate any Person object", () => {
    const p = Object.freeze(person());
    expect(() => findPersonByEmail([p], "dani@example.invalid")).not.toThrow();
    expect(p.email).toBe("dani@example.invalid");
  });
});

describe("findPersonByEmail — duplicate emails fail closed", () => {
  it("3. two personnel records with the same normalized email -> ambiguous, not either one", () => {
    const a = person({ id: "p_a", email: "shared@example.invalid" });
    const b = person({ id: "p_b", email: "SHARED@example.invalid" });
    expect(findPersonByEmail([a, b], "shared@example.invalid")).toEqual({ status: "ambiguous" });
  });

  it("4. duplicate-case emails never silently resolve to the first match", () => {
    const first = person({ id: "p_first", email: "shared@example.invalid" });
    const second = person({ id: "p_second", email: "Shared@Example.Invalid" });
    const result = findPersonByEmail([first, second], "SHARED@EXAMPLE.INVALID");
    expect(result.status).toBe("ambiguous");
    // Explicitly not the old .find()-style first-match behavior:
    expect(result).not.toEqual({ status: "found", person: first });
    expect(result).not.toEqual({ status: "found", person: second });
  });

  it("three-way duplicates are also ambiguous, not just exactly-two", () => {
    const variants = ["shared@example.invalid", "Shared@Example.Invalid", "SHARED@EXAMPLE.INVALID"].map(
      (email, index) => person({ id: `p_${index}`, email }),
    );
    expect(findPersonByEmail(variants, "shared@example.invalid")).toEqual({ status: "ambiguous" });
  });

  it("whitespace-only differences also count as duplicates", () => {
    const a = person({ id: "p_a", email: "shared@example.invalid" });
    const b = person({ id: "p_b", email: "  shared@example.invalid  " });
    expect(findPersonByEmail([a, b], "shared@example.invalid")).toEqual({ status: "ambiguous" });
  });

  it("a duplicate elsewhere in the list does not affect an unrelated unique email", () => {
    const dupA = person({ id: "p_a", email: "dup@example.invalid" });
    const dupB = person({ id: "p_b", email: "DUP@example.invalid" });
    const unique = person({ id: "p_c", email: "unique@example.invalid" });
    expect(findPersonByEmail([dupA, dupB, unique], "unique@example.invalid")).toEqual({
      status: "found",
      person: unique,
    });
  });
});

describe("resolveCurrentPerson (orchestration, mocked identity + Google layer)", () => {
  beforeEach(() => {
    getAuthenticatedIdentity.mockReset();
    fetchRawWorkbookSnapshot.mockReset();
  });

  it("8. returns unauthenticated when there is no authenticated identity, without fetching anything", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await resolveCurrentPerson();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("5. an authenticated user with no usable email resolves to missing_email, without fetching anything", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });
    const result = await resolveCurrentPerson();
    expect(result).toEqual({ status: "missing_email" });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("authenticated user with a matching personnel email resolves the Person", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
    });
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      sheets: [personnelSheet([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]])],
    });

    const result = await resolveCurrentPerson();

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.person.name).toBe("דני בדיקה");
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledWith(["personnel"]);
  });

  it("authenticated but unmapped email is denied", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "stranger@example.invalid",
    });
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      sheets: [personnelSheet([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]])],
    });

    const result = await resolveCurrentPerson();

    expect(result).toEqual({ status: "unmapped", email: "stranger@example.invalid" });
  });

  it("3. an authenticated email matching two personnel records is denied as ambiguous_identity, revealing nothing", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "shared@example.invalid",
    });
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      sheets: [
        personnelSheet([
          ["שם", "מייל"],
          ["דני בדיקה", "shared@example.invalid"],
          ["נועה דוגמה", "SHARED@example.invalid"],
        ]),
      ],
    });

    const result = await resolveCurrentPerson();

    expect(result).toEqual({ status: "ambiguous_identity" });
    // No name/email/record detail leaks through the result itself.
    expect(JSON.stringify(result)).not.toContain("דני");
    expect(JSON.stringify(result)).not.toContain("נועה");
    expect(JSON.stringify(result)).not.toContain("shared@example.invalid");
  });

  it("resolveCurrentPerson takes no arguments -- there is no way to pass a client-supplied email in", async () => {
    expect(resolveCurrentPerson.length).toBe(0);
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
    });
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      sheets: [personnelSheet([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]])],
    });
    const result = await resolveCurrentPerson();
    expect(result.status).toBe("ok");
  });
});
