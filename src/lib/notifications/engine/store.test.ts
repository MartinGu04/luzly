import { afterEach, describe, expect, it, vi } from "vitest";
import type { FactChange } from "./diffFacts";
import type { SemanticFact } from "./semanticFacts";

interface FakeRow {
  fact_key: string;
  category: string;
  original_value: Record<string, unknown>;
}

/**
 * A minimal, faithful fake of the exact postgrest query shapes
 * `applyPendingChanges` uses (`from().select().eq()` awaited directly,
 * `from().delete().eq().in()`, `from().upsert()`), tracking every write
 * for assertions -- there is no local Supabase/PostgREST stack available
 * in this sandbox to test the real HTTP layer against (unlike the SQL
 * functions themselves, which ARE proven against real Postgres in
 * `notificationEngineFunctions.integration.test.ts`). This is the same
 * fake-client style used by `recipients.test.ts`.
 */
function makeFakeSupabase(existingRows: FakeRow[]) {
  const deletedKeys: string[] = [];
  const upsertedRows: Record<string, unknown>[] = [];

  const client = {
    from: (table: string) => {
      if (table !== "pending_notification_changes") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: existingRows, error: null }),
        }),
        delete: () => ({
          eq: () => ({
            in: (_column: string, keys: string[]) => {
              deletedKeys.push(...keys);
              return Promise.resolve({ error: null });
            },
          }),
        }),
        upsert: (rows: Record<string, unknown>[]) => {
          upsertedRows.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { client, deletedKeys, upsertedRows };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeClient }));
  return import("./store");
}

function fact(factKey: string, category: string, value: unknown): SemanticFact {
  return { factKey, category: category as SemanticFact["category"], value: value as SemanticFact["value"] };
}

describe("applyPendingChanges -- debounce coalescing", () => {
  it("opens a brand-new pending row with original = the observed (old) value", async () => {
    const { client, upsertedRows } = makeFakeSupabase([]);
    const { applyPendingChanges } = await loadModule(client);

    const change: FactChange = {
      factKey: "shift:p1:2026-08-18",
      category: "shift",
      oldValue: { entries: [{ period: "day", role: "technician", shadow: false }] } as never,
      newValue: { entries: [{ period: "night", role: "technician", shadow: false }] } as never,
    };
    const freshFacts = new Map([["shift:p1:2026-08-18", fact("shift:p1:2026-08-18", "shift", change.newValue)]]);

    await applyPendingChanges("2026-08-16", [change], freshFacts);

    expect(upsertedRows).toHaveLength(1);
    expect(upsertedRows[0]).toMatchObject({
      fact_key: "shift:p1:2026-08-18",
      original_value: change.oldValue,
      latest_value: change.newValue,
      status: "pending",
    });
  });

  it("extends an already-open row: keeps the FIRST original_value, updates latest_value and settle_at (evening -> morning -> night coalesces)", async () => {
    // First tick already opened a row: original=evening, latest=morning.
    const existing: FakeRow = {
      fact_key: "shift:p1:2026-08-18",
      category: "shift",
      original_value: { entries: [{ period: "day", role: "technician", shadow: false }] }, // "evening" stand-in
    };
    const { client, upsertedRows } = makeFakeSupabase([existing]);
    const { applyPendingChanges } = await loadModule(client);

    // Second tick observes yet another value ("night" stand-in) -- the
    // diff's oldValue here would naively be "morning", but the upsert
    // must preserve the row's REAL original ("evening"), never the
    // diff's own oldValue.
    const nightValue = { entries: [{ period: "night", role: "technician", shadow: false }] };
    const change: FactChange = {
      factKey: "shift:p1:2026-08-18",
      category: "shift",
      oldValue: { entries: [{ period: "morning", role: "technician", shadow: false }] } as never,
      newValue: nightValue as never,
    };
    const freshFacts = new Map([["shift:p1:2026-08-18", fact("shift:p1:2026-08-18", "shift", nightValue)]]);

    await applyPendingChanges("2026-08-16", [change], freshFacts);

    expect(upsertedRows).toHaveLength(1);
    expect(upsertedRows[0].original_value).toEqual(existing.original_value); // "evening", not "morning"
    expect(upsertedRows[0].latest_value).toEqual(nightValue);
  });

  it("cancels a pending row when the current diff's fresh value returns to the row's TRUE original", async () => {
    const existing: FakeRow = {
      fact_key: "shift:p1:2026-08-18",
      category: "shift",
      original_value: { entries: [{ period: "day", role: "technician", shadow: false }] },
    };
    const { client, upsertedRows, deletedKeys } = makeFakeSupabase([existing]);
    const { applyPendingChanges } = await loadModule(client);

    const change: FactChange = {
      factKey: "shift:p1:2026-08-18",
      category: "shift",
      oldValue: { entries: [{ period: "night", role: "technician", shadow: false }] } as never,
      newValue: existing.original_value as never, // back to "day"
    };
    const freshFacts = new Map([["shift:p1:2026-08-18", fact("shift:p1:2026-08-18", "shift", existing.original_value)]]);

    await applyPendingChanges("2026-08-16", [change], freshFacts);

    expect(deletedKeys).toEqual(["shift:p1:2026-08-18"]);
    expect(upsertedRows).toHaveLength(0);
  });

  it("cancels a stale open row even when THIS tick's diff never mentions it -- the 'orphaned revert' case", async () => {
    // A prior tick opened this row (original=evening, latest=morning).
    // Meanwhile observed_notification_facts still says "evening" (only
    // a SETTLED change ever updates it). This tick's fresh read is back
    // to "evening" too -- identical to observed, so a plain
    // observed-vs-fresh diff produces ZERO changes for this key. Without
    // explicitly re-checking every open row, this would sit forever and
    // eventually settle as a false "evening -> morning" notification.
    const existing: FakeRow = {
      fact_key: "shift:p1:2026-08-18",
      category: "shift",
      original_value: { entries: [{ period: "day", role: "technician", shadow: false }] }, // "evening" stand-in
    };
    const { client, upsertedRows, deletedKeys } = makeFakeSupabase([existing]);
    const { applyPendingChanges } = await loadModule(client);

    const freshFacts = new Map([["shift:p1:2026-08-18", fact("shift:p1:2026-08-18", "shift", existing.original_value)]]);

    await applyPendingChanges("2026-08-16", [], freshFacts); // no diffed changes this tick at all

    expect(deletedKeys).toEqual(["shift:p1:2026-08-18"]);
    expect(upsertedRows).toHaveLength(0);
  });

  it("does nothing when there are no changes and no open pending rows", async () => {
    const { client, upsertedRows, deletedKeys } = makeFakeSupabase([]);
    const { applyPendingChanges } = await loadModule(client);

    await applyPendingChanges("2026-08-16", [], new Map());

    expect(deletedKeys).toHaveLength(0);
    expect(upsertedRows).toHaveLength(0);
  });
});
