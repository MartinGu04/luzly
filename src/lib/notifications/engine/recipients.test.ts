import { describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";

function person(overrides: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return { email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null, ...overrides };
}

function makeFakeSupabase(users: { id: string; email: string }[], subscriptionUserIds: string[] = []) {
  return {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users }, error: null })),
      },
    },
    from: vi.fn(() => ({
      select: vi.fn(async () => ({ data: subscriptionUserIds.map((user_id) => ({ user_id })), error: null })),
    })),
  };
}

describe("resolveNotificationRecipients", () => {
  it("resolves a person with a matching email to their Supabase user id", async () => {
    vi.resetModules();
    const fakeSupabase = makeFakeSupabase([{ id: "user-1", email: "Dana@Example.com" }]);
    vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeSupabase }));

    const { resolveNotificationRecipients } = await import("./recipients");
    const people = [person({ id: "p1", name: "Dana", email: "dana@example.com" })];
    const result = await resolveNotificationRecipients(people);

    expect(result.resolved.get("p1")).toEqual({ personId: "p1", email: "dana@example.com", userId: "user-1" });
    expect(result.unmappedCount).toBe(0);
    expect(result.ambiguousEmailCount).toBe(0);
  });

  it("skips a person with no email and counts them", async () => {
    vi.resetModules();
    const fakeSupabase = makeFakeSupabase([]);
    vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeSupabase }));

    const { resolveNotificationRecipients } = await import("./recipients");
    const result = await resolveNotificationRecipients([person({ id: "p1", name: "No Email" })]);

    expect(result.resolved.size).toBe(0);
    expect(result.noEmailCount).toBe(1);
  });

  it("skips (never guesses) a person whose email has no matching Supabase user", async () => {
    vi.resetModules();
    const fakeSupabase = makeFakeSupabase([]);
    vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeSupabase }));

    const { resolveNotificationRecipients } = await import("./recipients");
    const result = await resolveNotificationRecipients([person({ id: "p1", name: "Ghost", email: "ghost@example.com" })]);

    expect(result.resolved.size).toBe(0);
    expect(result.unmappedCount).toBe(1);
  });

  it("skips BOTH people when two sheet records share a normalized email -- never a silent first-match", async () => {
    vi.resetModules();
    const fakeSupabase = makeFakeSupabase([{ id: "user-1", email: "shared@example.com" }]);
    vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeSupabase }));

    const { resolveNotificationRecipients } = await import("./recipients");
    const people = [
      person({ id: "p1", name: "First", email: "shared@example.com" }),
      person({ id: "p2", name: "Second", email: " Shared@Example.com " }),
    ];
    const result = await resolveNotificationRecipients(people);

    expect(result.resolved.size).toBe(0);
    expect(result.ambiguousEmailCount).toBe(1);
  });
});

describe("filterManagerRecipients", () => {
  it("only includes people whose Person.isManager is true and who resolved to a Supabase user", async () => {
    vi.resetModules();
    const { filterManagerRecipients } = await import("./recipients");

    const manager = person({ id: "m1", name: "Manager", email: "m@example.com", isManager: true });
    const nonManager = person({ id: "u1", name: "User", email: "u@example.com" });
    const unresolvedManager = person({ id: "m2", name: "Unresolved Manager", isManager: true });

    const resolution = {
      resolved: new Map([
        ["m1", { personId: "m1", email: "m@example.com", userId: "user-m1" }],
        ["u1", { personId: "u1", email: "u@example.com", userId: "user-u1" }],
      ]),
      unmappedCount: 1,
      ambiguousEmailCount: 0,
      noEmailCount: 0,
    };

    const recipients = filterManagerRecipients([manager, nonManager, unresolvedManager], resolution);
    expect(recipients).toEqual([{ personId: "m1", email: "m@example.com", userId: "user-m1" }]);
  });
});

describe("resolvePersonIdentity", () => {
  it("mapped: a unique email matching a Supabase auth user", async () => {
    vi.resetModules();
    const { resolvePersonIdentity } = await import("./recipients");
    const people = [person({ id: "p1", name: "Dana", email: "dana@example.com" })];
    const emailToUserId = new Map([["dana@example.com", "user-1"]]);

    expect(resolvePersonIdentity(people[0], people, emailToUserId)).toEqual({
      status: "mapped",
      normalizedEmail: "dana@example.com",
      userId: "user-1",
    });
  });

  it("no_email: person has no email at all", async () => {
    vi.resetModules();
    const { resolvePersonIdentity } = await import("./recipients");
    const people = [person({ id: "p1", name: "No Email" })];

    expect(resolvePersonIdentity(people[0], people, new Map())).toEqual({ status: "no_email" });
  });

  it("ambiguous: two roster people share a normalized email -- fails closed for both", async () => {
    vi.resetModules();
    const { resolvePersonIdentity } = await import("./recipients");
    const people = [
      person({ id: "p1", name: "First", email: "shared@example.com" }),
      person({ id: "p2", name: "Second", email: " Shared@Example.com " }),
    ];

    expect(resolvePersonIdentity(people[0], people, new Map())).toEqual({ status: "ambiguous" });
    expect(resolvePersonIdentity(people[1], people, new Map())).toEqual({ status: "ambiguous" });
  });

  it("unmapped: a unique email with no matching Supabase auth user", async () => {
    vi.resetModules();
    const { resolvePersonIdentity } = await import("./recipients");
    const people = [person({ id: "p1", name: "Ghost", email: "ghost@example.com" })];

    expect(resolvePersonIdentity(people[0], people, new Map())).toEqual({
      status: "unmapped",
      normalizedEmail: "ghost@example.com",
    });
  });
});

describe("fetchAllSubscribedUserIds", () => {
  it("returns distinct user ids from push_subscriptions", async () => {
    vi.resetModules();
    const fakeSupabase = makeFakeSupabase([], ["user-1", "user-1", "user-2"]);
    vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeSupabase }));

    const { fetchAllSubscribedUserIds } = await import("./recipients");
    const userIds = await fetchAllSubscribedUserIds();

    expect(new Set(userIds)).toEqual(new Set(["user-1", "user-2"]));
  });
});
