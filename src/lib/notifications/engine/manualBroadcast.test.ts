import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";

function person(overrides: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return { email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null, ...overrides };
}

interface FakeUser {
  id: string;
  email: string;
}

/**
 * A single fake Supabase client covering every table
 * `sendManagerBroadcastNotification` touches: the Admin API user listing +
 * `push_subscriptions` (via `recipients.ts`), and `manager_notification_batches`
 * + `notification_jobs` (via `store.ts`). Unique-constraint conflicts are
 * modeled exactly like real Postgres: a repeated `idempotency_key`/
 * `dedupe_key` insert returns a `23505` error, mirroring
 * `insertManagerNotificationBatchIfAbsent`/`insertNotificationJobIfAbsent`'s
 * own real conflict-handling contract.
 */
function makeFakeSupabase(users: FakeUser[], subscribedUserIds: string[] = []) {
  const batchesByIdempotencyKey = new Map<string, Record<string, unknown>>();
  const jobsByDedupeKey = new Map<string, Record<string, unknown>>();
  let batchCounter = 0;
  let jobCounter = 0;

  const client = {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users }, error: null })),
      },
    },
    from: (table: string) => {
      if (table === "push_subscriptions") {
        return {
          select: () => Promise.resolve({ data: subscribedUserIds.map((user_id) => ({ user_id })), error: null }),
        };
      }

      if (table === "manager_notification_batches") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const key = row.idempotency_key as string;
                if (batchesByIdempotencyKey.has(key)) return { data: null, error: { code: "23505" } };
                batchCounter += 1;
                const stored = { id: `batch_${batchCounter}`, created_at: "2026-08-21T08:00:00.000Z", ...row };
                batchesByIdempotencyKey.set(key, stored);
                return { data: stored, error: null };
              },
            }),
          }),
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => ({ data: batchesByIdempotencyKey.get(value) ?? null, error: null }),
            }),
          }),
        };
      }

      if (table === "notification_jobs") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              maybeSingle: async () => {
                const key = row.dedupe_key as string;
                if (jobsByDedupeKey.has(key)) return { data: null, error: { code: "23505" } };
                jobCounter += 1;
                const stored = { id: `job_${jobCounter}`, ...row };
                jobsByDedupeKey.set(key, stored);
                return { data: stored, error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, batchesByIdempotencyKey, jobsByDedupeKey };
}

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeClient }));
  return import("./manualBroadcast");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

const MANAGER = person({ id: "p_manager", name: "דני מנהל", isManager: true });

describe("sendManagerBroadcastNotification -- title/body validation", () => {
  it("rejects a blank title", async () => {
    const { sendManagerBroadcastNotification } = await loadModule(makeFakeSupabase([]));
    const result = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER],
      audienceKind: "everyone",
      targetPersonIds: [],
      title: "   ",
      body: "תוכן",
      idempotencyKey: "idem-1",
    });
    expect(result).toEqual({ ok: false, error: "invalid_title" });
  });

  it("rejects a whitespace-only body", async () => {
    const { sendManagerBroadcastNotification } = await loadModule(makeFakeSupabase([]));
    const result = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER],
      audienceKind: "everyone",
      targetPersonIds: [],
      title: "כותרת",
      body: "\n\t ",
      idempotencyKey: "idem-1",
    });
    expect(result).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a title over the max length", async () => {
    const { sendManagerBroadcastNotification, BROADCAST_TITLE_MAX_LENGTH } = await loadModule(makeFakeSupabase([]));
    const result = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER],
      audienceKind: "everyone",
      targetPersonIds: [],
      title: "א".repeat(BROADCAST_TITLE_MAX_LENGTH + 1),
      body: "תוכן",
      idempotencyKey: "idem-1",
    });
    expect(result).toEqual({ ok: false, error: "invalid_title" });
  });

  it("rejects when the resolved audience is empty (no targets selected)", async () => {
    const { sendManagerBroadcastNotification } = await loadModule(makeFakeSupabase([]));
    const result = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER, person({ id: "p_1", name: "אחד" })],
      audienceKind: "people",
      targetPersonIds: [],
      title: "כותרת",
      body: "תוכן",
      idempotencyKey: "idem-1",
    });
    expect(result).toEqual({ ok: false, error: "no_targets" });
  });
});

describe("sendManagerBroadcastNotification -- recipient resolution", () => {
  it("one selected mapped recipient creates exactly one job, resolved and push-capable", async () => {
    const dana = person({ id: "p_dana", name: "דנה", email: "dana@example.invalid" });
    const { client, jobsByDedupeKey } = makeFakeSupabase([{ id: "user-dana", email: "dana@example.invalid" }], ["user-dana"]);
    const { sendManagerBroadcastNotification } = await loadModule(client);

    const outcome = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER, dana],
      audienceKind: "person",
      targetPersonIds: ["p_dana"],
      title: "כותרת",
      body: "תוכן",
      idempotencyKey: "idem-single",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.resolvedRecipientCount).toBe(1);
    expect(outcome.result.pushCapableCount).toBe(1);
    expect(outcome.result.inboxOnlyCount).toBe(0);
    expect(outcome.result.unresolved).toEqual([]);
    expect(jobsByDedupeKey.size).toBe(1);
    const [job] = [...jobsByDedupeKey.values()];
    expect(job.recipient_user_id).toBe("user-dana");
    expect(job.category).toBe("manager_broadcast");
  });

  it("multiple selected people create one job per resolved auth user", async () => {
    const dana = person({ id: "p_dana", name: "דנה", email: "dana@example.invalid" });
    const noa = person({ id: "p_noa", name: "נועה", email: "noa@example.invalid" });
    const { client, jobsByDedupeKey } = makeFakeSupabase(
      [
        { id: "user-dana", email: "dana@example.invalid" },
        { id: "user-noa", email: "noa@example.invalid" },
      ],
      ["user-dana"],
    );
    const { sendManagerBroadcastNotification } = await loadModule(client);

    const outcome = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER, dana, noa],
      audienceKind: "people",
      targetPersonIds: ["p_dana", "p_noa"],
      title: "כותרת",
      body: "תוכן",
      idempotencyKey: "idem-multi",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.resolvedRecipientCount).toBe(2);
    expect(outcome.result.pushCapableCount).toBe(1);
    expect(outcome.result.inboxOnlyCount).toBe(1);
    expect(jobsByDedupeKey.size).toBe(2);
  });

  it("'everyone' scopes to the full personnel roster passed in, never a client-selected subset", async () => {
    const dana = person({ id: "p_dana", name: "דנה", email: "dana@example.invalid" });
    const noa = person({ id: "p_noa", name: "נועה", email: "noa@example.invalid" });
    const { client, jobsByDedupeKey } = makeFakeSupabase(
      [
        { id: "user-dana", email: "dana@example.invalid" },
        { id: "user-noa", email: "noa@example.invalid" },
      ],
      [],
    );
    const { sendManagerBroadcastNotification } = await loadModule(client);

    const outcome = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER, dana, noa],
      audienceKind: "everyone",
      targetPersonIds: ["p_dana"], // deliberately ignored for "everyone"
      title: "כותרת",
      body: "תוכן",
      idempotencyKey: "idem-everyone",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // MANAGER has no email -> unresolved; dana/noa both mapped, no push subscriptions -> inbox-only.
    expect(outcome.result.resolvedRecipientCount).toBe(2);
    expect(outcome.result.inboxOnlyCount).toBe(2);
    expect(outcome.result.unresolved).toHaveLength(1);
    expect(outcome.result.unresolved[0]).toEqual({ personId: "p_manager", personName: "דני מנהל", reason: "missing_email" });
    expect(jobsByDedupeKey.size).toBe(2);
  });

  it("a mapped user with no Push subscription still gets a job -- inbox-only, never silently skipped", async () => {
    const dana = person({ id: "p_dana", name: "דנה", email: "dana@example.invalid" });
    const { client, jobsByDedupeKey } = makeFakeSupabase([{ id: "user-dana", email: "dana@example.invalid" }], []);
    const { sendManagerBroadcastNotification } = await loadModule(client);

    const outcome = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER, dana],
      audienceKind: "person",
      targetPersonIds: ["p_dana"],
      title: "כותרת",
      body: "תוכן",
      idempotencyKey: "idem-no-push",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.pushCapableCount).toBe(0);
    expect(outcome.result.inboxOnlyCount).toBe(1);
    expect(jobsByDedupeKey.size).toBe(1);
  });

  it("no-email / ambiguous / unmapped people are reported but NEVER guessed into a job", async () => {
    const noEmail = person({ id: "p_no_email", name: "בלי מייל" });
    const dupeA = person({ id: "p_dupe_a", name: "כפול א", email: "dupe@example.invalid" });
    const dupeB = person({ id: "p_dupe_b", name: "כפול ב", email: "dupe@example.invalid" });
    const ghost = person({ id: "p_ghost", name: "רוח רפאים", email: "ghost@example.invalid" });
    const { client, jobsByDedupeKey } = makeFakeSupabase([], []);
    const { sendManagerBroadcastNotification } = await loadModule(client);

    const outcome = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER, noEmail, dupeA, dupeB, ghost],
      audienceKind: "everyone",
      targetPersonIds: [],
      title: "כותרת",
      body: "תוכן",
      idempotencyKey: "idem-unresolved",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.resolvedRecipientCount).toBe(0);
    expect(jobsByDedupeKey.size).toBe(0);
    const reasons = outcome.result.unresolved.map((entry) => [entry.personId, entry.reason]).sort();
    expect(reasons).toEqual(
      [
        ["p_manager", "missing_email"],
        ["p_no_email", "missing_email"],
        ["p_dupe_a", "ambiguous_email"],
        ["p_dupe_b", "ambiguous_email"],
        ["p_ghost", "unmapped_account"],
      ].sort(),
    );
  });

  it("candidate ids outside the roster are silently ignored, never targeted -- 'people' resolves ONLY through real roster membership", async () => {
    const dana = person({ id: "p_dana", name: "דנה", email: "dana@example.invalid" });
    const { client, jobsByDedupeKey } = makeFakeSupabase([{ id: "user-dana", email: "dana@example.invalid" }], ["user-dana"]);
    const { sendManagerBroadcastNotification } = await loadModule(client);

    const outcome = await sendManagerBroadcastNotification({
      manager: MANAGER,
      people: [MANAGER, dana],
      audienceKind: "people",
      targetPersonIds: ["p_dana", "p_does_not_exist", "p_manager_impersonation"],
      title: "כותרת",
      body: "תוכן",
      idempotencyKey: "idem-tampered",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.resolvedRecipientCount).toBe(1);
    expect(jobsByDedupeKey.size).toBe(1);
  });
});

describe("sendManagerBroadcastNotification -- idempotency", () => {
  it("a duplicate submission with the SAME idempotency key never creates a second batch or a second job per recipient", async () => {
    const dana = person({ id: "p_dana", name: "דנה", email: "dana@example.invalid" });
    const { client, batchesByIdempotencyKey, jobsByDedupeKey } = makeFakeSupabase(
      [{ id: "user-dana", email: "dana@example.invalid" }],
      ["user-dana"],
    );
    const { sendManagerBroadcastNotification } = await loadModule(client);

    const input = {
      manager: MANAGER,
      people: [MANAGER, dana],
      audienceKind: "person" as const,
      targetPersonIds: ["p_dana"],
      title: "כותרת",
      body: "תוכן",
      idempotencyKey: "idem-retry",
    };

    const first = await sendManagerBroadcastNotification(input);
    const second = await sendManagerBroadcastNotification(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.result.batchId).toBe(first.result.batchId);
    expect(batchesByIdempotencyKey.size).toBe(1);
    expect(jobsByDedupeKey.size).toBe(1);
  });

  it("two DIFFERENT idempotency keys for the same content/target are treated as two genuine sends", async () => {
    const dana = person({ id: "p_dana", name: "דנה", email: "dana@example.invalid" });
    const { client, batchesByIdempotencyKey, jobsByDedupeKey } = makeFakeSupabase(
      [{ id: "user-dana", email: "dana@example.invalid" }],
      ["user-dana"],
    );
    const { sendManagerBroadcastNotification } = await loadModule(client);

    const base = {
      manager: MANAGER,
      people: [MANAGER, dana],
      audienceKind: "person" as const,
      targetPersonIds: ["p_dana"],
      title: "כותרת",
      body: "תוכן",
    };

    await sendManagerBroadcastNotification({ ...base, idempotencyKey: "idem-a" });
    await sendManagerBroadcastNotification({ ...base, idempotencyKey: "idem-b" });

    expect(batchesByIdempotencyKey.size).toBe(2);
    expect(jobsByDedupeKey.size).toBe(2);
  });
});
