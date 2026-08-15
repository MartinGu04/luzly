import { afterEach, describe, expect, it, vi } from "vitest";
import type { FactChange } from "./diffFacts";
import type { SemanticFact } from "./semanticFacts";

interface FakeRow {
  fact_key: string;
  category: string;
  original_value: Record<string, unknown>;
  latest_value: Record<string, unknown>;
  settle_at?: string;
}

/**
 * A minimal, faithful fake of the exact postgrest query shapes
 * `applyPendingChanges` uses (`from().select().eq()` awaited directly,
 * `from().delete().eq().in()`, `from().upsert()`) -- there is no local
 * Supabase/PostgREST stack available in this sandbox to test the real
 * HTTP layer against (unlike the SQL functions themselves, which ARE
 * proven against real Postgres in
 * `notificationEngineFunctions.integration.test.ts`). This is the same
 * fake-client style used by `recipients.test.ts`.
 *
 * Stateful (`rows` persists across calls) so the multi-tick simulations
 * below can call `applyPendingChanges` repeatedly, exactly like the real
 * worker firing every 5 minutes, and observe what a LATER tick actually
 * sees from an EARLIER tick's write -- not just single isolated calls.
 */
function makeStatefulFakeSupabase(initialRows: FakeRow[] = []) {
  const rows = new Map<string, FakeRow>(initialRows.map((row) => [row.fact_key, row]));

  const client = {
    from: (table: string) => {
      if (table !== "pending_notification_changes") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [...rows.values()], error: null }),
        }),
        delete: () => ({
          eq: () => ({
            in: (_column: string, keys: string[]) => {
              for (const key of keys) rows.delete(key);
              return Promise.resolve({ error: null });
            },
          }),
        }),
        upsert: (newRows: Record<string, unknown>[]) => {
          for (const row of newRows) rows.set(row.fact_key as string, row as unknown as FakeRow);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { client, rows };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useRealTimers();
});

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeClient }));
  return import("./store");
}

function fact(factKey: string, category: string, value: unknown): SemanticFact {
  return { factKey, category: category as SemanticFact["category"], value: value as SemanticFact["value"] };
}

const EVENING = { entries: [{ period: "day", role: "technician", shadow: false }] };
const MORNING = { entries: [{ period: "morning", role: "technician", shadow: false }] };
const NIGHT = { entries: [{ period: "night", role: "technician", shadow: false }] };
const KEY = "shift:p1:2026-08-18";
const WEEK = "2026-08-16";

describe("applyPendingChanges -- single-tick cases", () => {
  it("opens a brand-new pending row with original = the observed (old) value", async () => {
    const { client, rows } = makeStatefulFakeSupabase([]);
    const { applyPendingChanges } = await loadModule(client);

    const change: FactChange = { factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: NIGHT as never };
    const freshFacts = new Map([[KEY, fact(KEY, "shift", NIGHT)]]);

    await applyPendingChanges(WEEK, [change], freshFacts);

    const row = rows.get(KEY)!;
    expect(row.original_value).toEqual(EVENING);
    expect(row.latest_value).toEqual(NIGHT);
  });

  it("extends an already-open row with a GENUINELY NEW value: keeps the FIRST original_value, updates latest_value and settle_at", async () => {
    const existing: FakeRow = { fact_key: KEY, category: "shift", original_value: EVENING, latest_value: MORNING };
    const { client, rows } = makeStatefulFakeSupabase([existing]);
    const { applyPendingChanges } = await loadModule(client);

    // The diff's own oldValue here is stale ("morning"), but the row's
    // REAL original ("evening") must be preserved, never overwritten by
    // the diff's oldValue.
    const change: FactChange = { factKey: KEY, category: "shift", oldValue: MORNING as never, newValue: NIGHT as never };
    const freshFacts = new Map([[KEY, fact(KEY, "shift", NIGHT)]]);

    await applyPendingChanges(WEEK, [change], freshFacts);

    const row = rows.get(KEY)!;
    expect(row.original_value).toEqual(EVENING);
    expect(row.latest_value).toEqual(NIGHT);
  });

  it("a fresh value identical to the row's already-recorded latest_value leaves the row COMPLETELY untouched -- polling is never evidence of a new change", async () => {
    const existing: FakeRow = {
      fact_key: KEY,
      category: "shift",
      original_value: EVENING,
      latest_value: MORNING,
      settle_at: "2026-08-16T18:10:00.000Z",
    };
    const { client, rows } = makeStatefulFakeSupabase([existing]);
    const { applyPendingChanges } = await loadModule(client);

    const change: FactChange = { factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: MORNING as never };
    const freshFacts = new Map([[KEY, fact(KEY, "shift", MORNING)]]);

    await applyPendingChanges(WEEK, [change], freshFacts);

    const row = rows.get(KEY)!;
    expect(row.settle_at).toBe("2026-08-16T18:10:00.000Z"); // completely unchanged
    expect(row.latest_value).toEqual(MORNING);
  });

  it("cancels a pending row when the fresh value returns to the row's TRUE original", async () => {
    const existing: FakeRow = { fact_key: KEY, category: "shift", original_value: EVENING, latest_value: NIGHT };
    const { client, rows } = makeStatefulFakeSupabase([existing]);
    const { applyPendingChanges } = await loadModule(client);

    const change: FactChange = { factKey: KEY, category: "shift", oldValue: NIGHT as never, newValue: EVENING as never };
    const freshFacts = new Map([[KEY, fact(KEY, "shift", EVENING)]]);

    await applyPendingChanges(WEEK, [change], freshFacts);

    expect(rows.has(KEY)).toBe(false);
  });

  it("cancels a stale open row even when THIS tick's diff never mentions it -- the 'orphaned revert' case", async () => {
    const existing: FakeRow = { fact_key: KEY, category: "shift", original_value: EVENING, latest_value: MORNING };
    const { client, rows } = makeStatefulFakeSupabase([existing]);
    const { applyPendingChanges } = await loadModule(client);

    const freshFacts = new Map([[KEY, fact(KEY, "shift", EVENING)]]);
    await applyPendingChanges(WEEK, [], freshFacts); // no diffed changes this tick at all

    expect(rows.has(KEY)).toBe(false);
  });

  it("does nothing when there are no changes and no open pending rows", async () => {
    const { client, rows } = makeStatefulFakeSupabase([]);
    const { applyPendingChanges } = await loadModule(client);

    await applyPendingChanges(WEEK, [], new Map());

    expect(rows.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Multi-tick simulations at the real production cadence: the worker fires
// every 5 minutes and re-diffs `observed` (unchanged until settlement)
// against a fresh read every time, so these tests call
// applyPendingChanges REPEATEDLY across simulated 5-minute ticks --
// exactly reproducing the bug report's scenario -- rather than calling
// the function once and trusting the single-call unit tests above to
// generalize.
// ---------------------------------------------------------------------------

function at(isoTime: string): void {
  vi.setSystemTime(new Date(isoTime));
}

describe("applyPendingChanges -- repeated worker ticks at 5-minute cadence", () => {
  it("A. a stable changed value settles on schedule -- settle_at must NOT be pushed forward by repeated polling of the same unsettled diff", async () => {
    vi.useFakeTimers();
    const { client, rows } = makeStatefulFakeSupabase([]);
    const { applyPendingChanges } = await loadModule(client);
    const freshFacts = new Map([[KEY, fact(KEY, "shift", MORNING)]]);
    const change: FactChange = { factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: MORNING as never };

    // T=00 -- observed=evening, fresh=morning. Opens the pending row.
    at("2026-08-16T18:00:00.000Z");
    await applyPendingChanges(WEEK, [change], freshFacts);
    const settleAtAfterFirstTick = rows.get(KEY)!.settle_at;
    expect(settleAtAfterFirstTick).toBe("2026-08-16T18:10:00.000Z");

    // T=05 -- observed STILL evening (nothing settled yet), fresh STILL
    // morning -- diffSemanticFacts(observed, fresh) reports the exact
    // same "evening -> morning" change again, since observed hasn't
    // moved. settle_at must remain exactly what it was.
    at("2026-08-16T18:05:00.000Z");
    await applyPendingChanges(WEEK, [change], freshFacts);
    expect(rows.get(KEY)!.settle_at).toBe(settleAtAfterFirstTick);

    // A third tick at T=09 (still before the original 18:10 deadline)
    // must ALSO leave it untouched -- proves this isn't a one-off fluke.
    at("2026-08-16T18:09:00.000Z");
    await applyPendingChanges(WEEK, [change], freshFacts);
    expect(rows.get(KEY)!.settle_at).toBe(settleAtAfterFirstTick);

    // T=10+ -- claim/settle is the real SQL function's job (proven for
    // real against Postgres in
    // notificationEngineFunctions.integration.test.ts); here we only
    // assert the row is exactly what a correct settle should consume:
    // original=evening, latest=morning, due at 18:10.
    expect(rows.get(KEY)).toMatchObject({ original_value: EVENING, latest_value: MORNING, settle_at: "2026-08-16T18:10:00.000Z" });
  });

  it("B. evening -> morning -> night coalesces: settle_at resets only on the GENUINE second change, not on repeated polling of either value", async () => {
    vi.useFakeTimers();
    const { client, rows } = makeStatefulFakeSupabase([]);
    const { applyPendingChanges } = await loadModule(client);

    // T=00: evening -> morning.
    at("2026-08-16T18:00:00.000Z");
    await applyPendingChanges(WEEK, [{ factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: MORNING as never }], new Map([[KEY, fact(KEY, "shift", MORNING)]]));
    expect(rows.get(KEY)!.settle_at).toBe("2026-08-16T18:10:00.000Z");

    // T=05: still morning -- must not move settle_at.
    at("2026-08-16T18:05:00.000Z");
    await applyPendingChanges(WEEK, [{ factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: MORNING as never }], new Map([[KEY, fact(KEY, "shift", MORNING)]]));
    expect(rows.get(KEY)!.settle_at).toBe("2026-08-16T18:10:00.000Z");

    // T=07: morning -> night. A genuinely new value -- resets the clock.
    at("2026-08-16T18:07:00.000Z");
    await applyPendingChanges(WEEK, [{ factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: NIGHT as never }], new Map([[KEY, fact(KEY, "shift", NIGHT)]]));
    expect(rows.get(KEY)!.settle_at).toBe("2026-08-16T18:17:00.000Z");
    expect(rows.get(KEY)!.original_value).toEqual(EVENING); // still the true original

    // T=12: still night -- must not move settle_at again.
    at("2026-08-16T18:12:00.000Z");
    await applyPendingChanges(WEEK, [{ factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: NIGHT as never }], new Map([[KEY, fact(KEY, "shift", NIGHT)]]));
    expect(rows.get(KEY)!.settle_at).toBe("2026-08-16T18:17:00.000Z");

    // T=17+: ready to settle as evening -> night (a single coalesced
    // notification, not two) -- the real settle/claim mechanics are
    // proven against real Postgres elsewhere; here we assert the row
    // that would be consumed is exactly right.
    expect(rows.get(KEY)).toMatchObject({ original_value: EVENING, latest_value: NIGHT });
  });

  it("C. evening -> morning -> evening (revert) sends zero notifications", async () => {
    vi.useFakeTimers();
    const { client, rows } = makeStatefulFakeSupabase([]);
    const { applyPendingChanges } = await loadModule(client);

    // T=00: evening -> morning.
    at("2026-08-16T18:00:00.000Z");
    await applyPendingChanges(WEEK, [{ factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: MORNING as never }], new Map([[KEY, fact(KEY, "shift", MORNING)]]));
    expect(rows.has(KEY)).toBe(true);

    // T=05: still morning -- no-op.
    at("2026-08-16T18:05:00.000Z");
    await applyPendingChanges(WEEK, [{ factKey: KEY, category: "shift", oldValue: EVENING as never, newValue: MORNING as never }], new Map([[KEY, fact(KEY, "shift", MORNING)]]));
    expect(rows.has(KEY)).toBe(true);

    // T=07: fresh reverts to "evening" -- since `observed` is STILL
    // "evening" too (nothing has settled), the real
    // diffSemanticFacts(observed, fresh) would report NO change at all
    // for this key (old === new), so this tick's `changes` array is
    // empty here -- exactly the "orphaned revert" path, not a
    // change-object with oldValue===newValue (which diffSemanticFacts
    // itself would never produce).
    at("2026-08-16T18:07:00.000Z");
    await applyPendingChanges(WEEK, [], new Map([[KEY, fact(KEY, "shift", EVENING)]]));

    expect(rows.has(KEY)).toBe(false); // no pending row left to ever settle -- zero notifications
  });
});
