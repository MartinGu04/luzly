import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";
import type { LocalNow } from "@/lib/domain/localNow";
import type { CustomWeeklyRuleConfig } from "./ruleConfig";

/**
 * A stateful, in-memory fake that faithfully mirrors
 * `claim_notification_rule_occurrence`'s own real semantics (see the
 * migration's doc comment): fresh claim only when the rule is currently
 * enabled/not archived, resume unconditionally once stale, refuse while
 * actively leased, refuse forever once completed. This lets these tests
 * exercise genuine multi-tick crash-recovery scenarios against the SAME
 * state machine the real SQL implements -- what it CANNOT prove is
 * Postgres-level transactional atomicity itself (row locking, `for
 * update`, concurrent commit ordering), which has no live Postgres
 * available in this environment; see `notificationRulesMigration.test.ts`
 * for the SQL's own text-level shape checks instead.
 */
function createFakeClaimStore() {
  interface RuleState {
    enabled: boolean;
    archived: boolean;
    title: string;
    body: string;
    audienceKind: "everyone" | "person" | "people";
    targetPersonIds: string[];
  }
  interface OccurrenceState {
    id: string;
    status: "claimed" | "completed";
    batchId: string | null;
    claimedAtMs: number;
  }

  const rules = new Map<string, RuleState>();
  const occurrences = new Map<string, OccurrenceState>();
  let occurrenceCounter = 0;
  const LEASE_MS = 90_000;

  function setRule(ruleId: string, state: RuleState) {
    rules.set(ruleId, state);
  }

  async function claim(ruleId: string, occurrenceDate: string, nowMs = Date.now()) {
    const key = `${ruleId}:${occurrenceDate}`;
    const existing = occurrences.get(key);
    const rule = rules.get(ruleId);

    if (existing) {
      if (existing.status === "completed") return null;
      if (nowMs - existing.claimedAtMs < LEASE_MS) return null; // actively leased by "someone else"
      // Stale -- resume UNCONDITIONALLY, independent of the rule's current state.
      existing.claimedAtMs = nowMs;
      if (!rule) throw new Error("fake: rule missing for resume");
      return {
        occurrenceId: existing.id,
        batchId: existing.batchId,
        isResume: true,
        ruleTitle: rule.title,
        ruleBody: rule.body,
        ruleAudienceKind: rule.audienceKind,
        ruleTargetPersonIds: rule.targetPersonIds,
      };
    }

    if (!rule || !rule.enabled || rule.archived) return null; // fresh claim requires currently-enabled

    occurrenceCounter += 1;
    const created: OccurrenceState = { id: `occ-${occurrenceCounter}`, status: "claimed", batchId: null, claimedAtMs: nowMs };
    occurrences.set(key, created);
    return {
      occurrenceId: created.id,
      batchId: null,
      isResume: false,
      ruleTitle: rule.title,
      ruleBody: rule.body,
      ruleAudienceKind: rule.audienceKind,
      ruleTargetPersonIds: rule.targetPersonIds,
    };
  }

  async function setBatchId(occurrenceId: string, batchId: string) {
    for (const occurrence of occurrences.values()) {
      if (occurrence.id === occurrenceId && occurrence.batchId === null) occurrence.batchId = batchId;
    }
  }

  async function complete(occurrenceId: string) {
    for (const occurrence of occurrences.values()) {
      if (occurrence.id === occurrenceId && occurrence.status === "claimed") occurrence.status = "completed";
    }
  }

  function statusOf(ruleId: string, occurrenceDate: string) {
    return occurrences.get(`${ruleId}:${occurrenceDate}`)?.status ?? null;
  }

  function expireLease(ruleId: string, occurrenceDate: string) {
    const occurrence = occurrences.get(`${ruleId}:${occurrenceDate}`);
    if (occurrence) occurrence.claimedAtMs -= LEASE_MS + 1000;
  }

  return { setRule, claim, setBatchId, complete, statusOf, expireLease };
}

/** A stateful fake for `manager_notification_batches`, keyed by idempotency_key (matching the real table's unique constraint) -- lets a resumed dispatch genuinely find its own earlier-created batch. */
function createFakeBatchStore() {
  const byIdempotencyKey = new Map<string, Record<string, unknown>>();
  const byId = new Map<string, Record<string, unknown>>();
  let counter = 0;

  async function insertIfAbsent(batch: Record<string, unknown>) {
    const key = batch.idempotencyKey as string;
    const existing = byIdempotencyKey.get(key);
    if (existing) return { row: existing, created: false };

    counter += 1;
    const row = { id: `batch-${counter}`, ...batch };
    byIdempotencyKey.set(key, row);
    byId.set(row.id, row);
    return { row, created: true };
  }

  async function getById(id: string) {
    return byId.get(id) ?? null;
  }

  return { insertIfAbsent, getById, byIdempotencyKey };
}

/** A stateful fake for `notification_jobs`, keyed by dedupe_key -- can be configured to throw for specific keys to simulate a crash mid-job-creation (recovery scenario B). */
function createFakeJobStore() {
  const created = new Set<string>();
  const failingKeys = new Set<string>();

  async function insertIfAbsent(job: { dedupeKey: string }) {
    if (failingKeys.has(job.dedupeKey)) throw new Error(`fake: simulated crash creating job ${job.dedupeKey}`);
    if (created.has(job.dedupeKey)) return false;
    created.add(job.dedupeKey);
    return true;
  }

  return { insertIfAbsent, created, failingKeys };
}

const fetchAllUserIdsByEmail = vi.fn<() => Promise<Map<string, { userId: string; avatarUrl: string | null }>>>(
  async () => new Map(),
);
const fetchAllSubscribedUserIds = vi.fn<() => Promise<string[]>>(async () => []);

let claimStore = createFakeClaimStore();
let batchStore = createFakeBatchStore();
let jobStore = createFakeJobStore();

async function loadModule() {
  vi.doMock("./store", () => ({
    claimNotificationRuleOccurrence: (ruleId: string, occurrenceDate: string) => claimStore.claim(ruleId, occurrenceDate),
    setNotificationRuleOccurrenceBatchId: (occurrenceId: string, batchId: string) => claimStore.setBatchId(occurrenceId, batchId),
    completeNotificationRuleOccurrence: (occurrenceId: string) => claimStore.complete(occurrenceId),
    listCompletedNotificationRuleOccurrenceKeys: async () => new Set<string>(),
    insertManagerNotificationBatchIfAbsent: (batch: Record<string, unknown>) => batchStore.insertIfAbsent(batch),
    getManagerNotificationBatchById: (id: string) => batchStore.getById(id),
    insertNotificationJobIfAbsent: (job: { dedupeKey: string }) => jobStore.insertIfAbsent(job),
  }));
  vi.doMock("./recipients", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./recipients")>();
    return { ...actual, fetchAllUserIdsByEmail, fetchAllSubscribedUserIds };
  });
  return import("./recurringRuleDispatch");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  claimStore = createFakeClaimStore();
  batchStore = createFakeBatchStore();
  jobStore = createFakeJobStore();
});

function rule(overrides: Partial<CustomWeeklyRuleConfig> = {}): CustomWeeklyRuleConfig {
  return {
    id: "rule-1",
    enabled: true,
    weekday: 6, // Saturday
    localHour: 21,
    localMinute: 0,
    title: "📌 תזכורת לאילוצים",
    body: "body",
    audienceKind: "everyone",
    targetPersonIds: [],
    createdByPersonId: "mgr-1",
    createdByPersonName: "מנהל",
    ...overrides,
  };
}

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

describe("findDueCustomWeeklyOccurrences -- weekday/time due check", () => {
  it("is due once the configured weekday's configured time has passed", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const saturday2100 = rule({ weekday: 6, localHour: 21, localMinute: 0 });
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 21 * 60 };

    const due = await findDueCustomWeeklyOccurrences([saturday2100], now);

    expect(due).toEqual([{ rule: saturday2100, occurrenceDate: "2026-08-22" }]);
  });

  it("is NOT due before the configured time on the correct weekday", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const saturday2100 = rule({ weekday: 6, localHour: 21, localMinute: 0 });
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 20 * 60 + 59 };

    expect(await findDueCustomWeeklyOccurrences([saturday2100], now)).toEqual([]);
  });

  it("is NOT due on a different weekday, even at/after the configured time", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const saturday2100 = rule({ weekday: 6, localHour: 21, localMinute: 0 });
    const now: LocalNow = { date: "2026-08-23", minuteOfDay: 22 * 60 }; // Sunday

    expect(await findDueCustomWeeklyOccurrences([saturday2100], now)).toEqual([]);
  });

  it("a disabled rule is never due, even on its configured weekday/time", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 21 * 60 };

    expect(await findDueCustomWeeklyOccurrences([rule({ enabled: false })], now)).toEqual([]);
  });
});

describe("runDueCustomWeeklyRuleDispatch -- fresh dispatch + audience resolution", () => {
  it("'everyone' resolves against the CURRENT roster passed in, never a frozen snapshot on the rule itself", async () => {
    claimStore.setRule("rule-1", { enabled: true, archived: false, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [] });
    fetchAllUserIdsByEmail.mockResolvedValue(
      new Map([
        ["a@example.com", { userId: "user-a", avatarUrl: null }],
        ["b@example.com", { userId: "user-b", avatarUrl: null }],
      ]),
    );
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();

    const occurrence = { rule: rule(), occurrenceDate: "2026-08-22" };
    const people = [person("p_a", { email: "a@example.com" }), person("p_b", { email: "b@example.com" })];
    const summary = await runDueCustomWeeklyRuleDispatch([occurrence], people);

    expect(summary).toEqual({ dispatched: 1, failed: 0 });
    expect(jobStore.created).toEqual(new Set(["recurring:batch-1:user-a", "recurring:batch-1:user-b"]));
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBe("completed");
  });

  it("selected 'people' audience is revalidated against the current roster -- a stale id is skipped truthfully, never fails the whole occurrence", async () => {
    claimStore.setRule("rule-1", {
      enabled: true,
      archived: false,
      title: "t",
      body: "b",
      audienceKind: "people",
      targetPersonIds: ["p_a", "p_removed"],
    });
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();

    const occurrence = { rule: rule({ audienceKind: "people", targetPersonIds: ["p_a", "p_removed"] }), occurrenceDate: "2026-08-22" };
    const summary = await runDueCustomWeeklyRuleDispatch([occurrence], [person("p_a", { email: "a@example.com" })]);

    expect(summary).toEqual({ dispatched: 1, failed: 0 });
    expect(jobStore.created).toEqual(new Set(["recurring:batch-1:user-a"]));
  });

  it("zero due occurrences performs zero I/O", async () => {
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();
    expect(await runDueCustomWeeklyRuleDispatch([], [])).toEqual({ dispatched: 0, failed: 0 });
    expect(fetchAllUserIdsByEmail).not.toHaveBeenCalled();
  });
});

describe("crash-recovery scenarios (the reviewed hole this design fixes)", () => {
  it("A. crash after occurrence/batch creation, before ANY jobs: a later tick recovers and creates every intended job exactly once", async () => {
    claimStore.setRule("rule-1", { enabled: true, archived: false, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [] });
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    // Simulate "crash before any jobs": make every job insert fail on this first attempt.
    jobStore.failingKeys.add("recurring:batch-1:user-a");
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();
    const occurrence = { rule: rule(), occurrenceDate: "2026-08-22" };
    const people = [person("p_a", { email: "a@example.com" })];

    const first = await runDueCustomWeeklyRuleDispatch([occurrence], people);
    expect(first).toEqual({ dispatched: 0, failed: 1 });
    // The batch WAS created and checkpointed even though the job insert crashed.
    expect(batchStore.byIdempotencyKey.get("recurring:rule-1:2026-08-22")).toBeTruthy();
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBe("claimed"); // not yet completed

    // Next tick: lease has NOT expired yet, so an immediate retry (same
    // worker's own retry loop, or a wholly different tick within the
    // 90s lease) correctly still finds it actively claimed and skips --
    // proving this is NOT a busy-retry loop that could double-send.
    const immediateRetry = await runDueCustomWeeklyRuleDispatch([occurrence], people);
    expect(immediateRetry).toEqual({ dispatched: 0, failed: 0 });

    // Now let the lease go stale (simulating enough real time passing)
    // and stop simulating the crash -- the SAME occurrence resumes and
    // completes.
    claimStore.expireLease("rule-1", "2026-08-22");
    jobStore.failingKeys.delete("recurring:batch-1:user-a");
    const resumed = await runDueCustomWeeklyRuleDispatch([occurrence], people);

    expect(resumed).toEqual({ dispatched: 1, failed: 0 });
    expect(jobStore.created).toEqual(new Set(["recurring:batch-1:user-a"]));
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBe("completed");
    // Exactly ONE batch was ever created for this occurrence, never a second one.
    expect(batchStore.byIdempotencyKey.size).toBe(1);
  });

  it("B. partial job creation: recipient A's job exists, recipient B's insertion crashes -- a retry creates B without duplicating A", async () => {
    claimStore.setRule("rule-1", { enabled: true, archived: false, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [] });
    fetchAllUserIdsByEmail.mockResolvedValue(
      new Map([
        ["a@example.com", { userId: "user-a", avatarUrl: null }],
        ["b@example.com", { userId: "user-b", avatarUrl: null }],
      ]),
    );
    jobStore.failingKeys.add("recurring:batch-1:user-b");
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();
    const occurrence = { rule: rule(), occurrenceDate: "2026-08-22" };
    const people = [person("p_a", { email: "a@example.com" }), person("p_b", { email: "b@example.com" })];

    const first = await runDueCustomWeeklyRuleDispatch([occurrence], people);
    expect(first).toEqual({ dispatched: 0, failed: 1 });
    expect(jobStore.created).toEqual(new Set(["recurring:batch-1:user-a"])); // A succeeded, B did not
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBe("claimed");

    claimStore.expireLease("rule-1", "2026-08-22");
    jobStore.failingKeys.delete("recurring:batch-1:user-b");
    const resumed = await runDueCustomWeeklyRuleDispatch([occurrence], people);

    expect(resumed).toEqual({ dispatched: 1, failed: 0 });
    // A is not duplicated (the set has exactly one entry for A), B now exists too.
    expect(jobStore.created).toEqual(new Set(["recurring:batch-1:user-a", "recurring:batch-1:user-b"]));
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBe("completed");
  });

  it("C. a completed occurrence: later ticks create nothing", async () => {
    claimStore.setRule("rule-1", { enabled: true, archived: false, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [] });
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();
    const occurrence = { rule: rule(), occurrenceDate: "2026-08-22" };
    const people = [person("p_a", { email: "a@example.com" })];

    await runDueCustomWeeklyRuleDispatch([occurrence], people);
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBe("completed");

    // Even after the lease would have expired, a completed occurrence never resumes.
    claimStore.expireLease("rule-1", "2026-08-22");
    const again = await runDueCustomWeeklyRuleDispatch([occurrence], people);

    expect(again).toEqual({ dispatched: 0, failed: 0 });
    expect(jobStore.created).toEqual(new Set(["recurring:batch-1:user-a"])); // unchanged
  });

  it("D. two concurrent workers racing the SAME occurrence: only one claims it, one batch, one job per recipient", async () => {
    claimStore.setRule("rule-1", { enabled: true, archived: false, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [] });
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();
    const occurrence = { rule: rule(), occurrenceDate: "2026-08-22" };
    const people = [person("p_a", { email: "a@example.com" })];

    // Two "concurrent" worker invocations dispatching the exact same
    // candidate in the same tick -- the fake claim store's lease check
    // means the second sees the first's fresh claim as active and skips.
    const [first, second] = await Promise.all([
      runDueCustomWeeklyRuleDispatch([occurrence], people),
      runDueCustomWeeklyRuleDispatch([occurrence], people),
    ]);

    const totals = { dispatched: first.dispatched + second.dispatched, failed: first.failed + second.failed };
    expect(totals.dispatched).toBe(1);
    expect(jobStore.created).toEqual(new Set(["recurring:batch-1:user-a"]));
    expect(batchStore.byIdempotencyKey.size).toBe(1);
  });

  it("E. disable before claim: no occurrence dispatch", async () => {
    claimStore.setRule("rule-1", { enabled: false, archived: false, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [] });
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();
    const occurrence = { rule: rule(), occurrenceDate: "2026-08-22" };

    const summary = await runDueCustomWeeklyRuleDispatch([occurrence], [person("p_a")]);

    expect(summary).toEqual({ dispatched: 0, failed: 0 });
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBeNull(); // never even claimed
  });

  it("F. edit before claim: dispatch uses the rule content frozen AT CLAIM TIME, never a stale earlier snapshot", async () => {
    claimStore.setRule("rule-1", {
      enabled: true,
      archived: false,
      title: "כותרת חדשה אחרי עריכה",
      body: "גוף חדש",
      audienceKind: "everyone",
      targetPersonIds: [],
    });
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();

    // The in-memory candidate still carries the OLD title (as if loaded
    // by an earlier tick's due-check before the edit landed) -- the
    // claim's own fresh rule content must win, not this stale copy.
    const staleCandidate = { rule: rule({ title: "כותרת ישנה" }), occurrenceDate: "2026-08-22" };
    await runDueCustomWeeklyRuleDispatch([staleCandidate], [person("p_a", { email: "a@example.com" })]);

    const storedBatch = batchStore.byIdempotencyKey.get("recurring:rule-1:2026-08-22");
    expect(storedBatch?.title).toBe("כותרת חדשה אחרי עריכה");
  });

  it("G. disable/archive after a due lookup but before claim: the persisted state wins over the stale in-memory candidate", async () => {
    // The candidate was computed while the rule LOOKED enabled/due --
    // but by claim time it has since been archived.
    claimStore.setRule("rule-1", { enabled: true, archived: true, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [] });
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();
    const staleCandidate = { rule: rule({ enabled: true }), occurrenceDate: "2026-08-22" };

    const summary = await runDueCustomWeeklyRuleDispatch([staleCandidate], [person("p_a")]);

    expect(summary).toEqual({ dispatched: 0, failed: 0 });
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBeNull();
  });

  it("H. retry after claim lease expiry resumes safely -- no duplicate send even though the FIRST attempt actually finished normally between the two calls", async () => {
    claimStore.setRule("rule-1", { enabled: true, archived: false, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [] });
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();
    const occurrence = { rule: rule(), occurrenceDate: "2026-08-22" };
    const people = [person("p_a", { email: "a@example.com" })];

    await runDueCustomWeeklyRuleDispatch([occurrence], people);
    expect(claimStore.statusOf("rule-1", "2026-08-22")).toBe("completed");

    // A very late duplicate tick (e.g. a stray retry) arrives well after
    // the lease window -- since the occurrence is already 'completed',
    // it must never resend regardless of lease timing.
    claimStore.expireLease("rule-1", "2026-08-22");
    const late = await runDueCustomWeeklyRuleDispatch([occurrence], people);

    expect(late).toEqual({ dispatched: 0, failed: 0 });
    expect(jobStore.created.size).toBe(1);
  });
});
