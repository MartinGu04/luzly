import { afterEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

/**
 * A single fake Supabase client covering `manager_scheduled_broadcasts`
 * (the guarded-update surface this whole feature's safety depends on --
 * `status = 'scheduled'`/`status = 'claimed'`/`batch_id is null` guards
 * must actually filter, not just be present in the call) and
 * `manager_notification_batches` (read-only lookup by id, for the
 * dispatch-resume path). Backed by a real in-memory array so a guarded
 * update genuinely no-ops (returns no row) once its WHERE clause no
 * longer matches -- the same property `manualBroadcast.test.ts`'s fake
 * proves for `manager_notification_batches`'s idempotency_key.
 */
function makeFakeSupabase(scheduledRows: Row[] = [], batchRows: Row[] = []) {
  // A raw fixture that doesn't care about scheduled_for's own value still
  // needs a real, parseable timestamptz -- the column is NOT NULL in
  // production. Individual tests override this when the value itself
  // matters (e.g. the PostgREST offset-representation proof below).
  const scheduled: Row[] = scheduledRows.map((row): Row => ({ scheduled_for: "2026-08-23T17:00:00.000Z", ...row }));
  const batches = [...batchRows];
  let idCounter = scheduled.length;

  function matches(row: Row, filters: [string, unknown][]): boolean {
    return filters.every(([col, val]) => row[col] === val);
  }

  function scheduledTable() {
    return {
      insert: (payload: Row) => ({
        select: () => ({
          single: async () => {
            // Real Postgres unique-constraint conflict on create_idempotency_key.
            const conflict = scheduled.find((row) => row.create_idempotency_key === payload.create_idempotency_key);
            if (conflict) return { data: null, error: { code: "23505" } };

            idCounter += 1;
            const row: Row = {
              id: `sb_${idCounter}`,
              status: "scheduled",
              last_changed_by_person_id: null,
              last_changed_by_person_name: null,
              cancelled_by_person_id: null,
              cancelled_by_person_name: null,
              claimed_at: null,
              batch_id: null,
              dispatched_at: null,
              cancelled_at: null,
              created_at: "2026-08-20T08:00:00.000Z",
              updated_at: "2026-08-20T08:00:00.000Z",
              ...payload,
            };
            scheduled.push(row);
            return { data: row, error: null };
          },
        }),
      }),
      select: () => {
        const filters: [string, unknown][] = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          in: (col: string, vals: unknown[]) => ({
            order: async () => ({
              data: scheduled.filter((row) => vals.includes(row[col]) && matches(row, filters)),
              error: null,
            }),
          }),
          maybeSingle: async () => ({ data: scheduled.find((row) => matches(row, filters)) ?? null, error: null }),
        };
        return chain;
      },
      update: (payload: Row) => {
        const filters: [string, unknown][] = [];
        const nullFilters: string[] = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          is: (col: string, val: null) => {
            void val;
            nullFilters.push(col);
            return chain;
          },
          select: () => ({
            maybeSingle: async () => {
              const row = scheduled.find((r) => matches(r, filters) && nullFilters.every((col) => r[col] === null));
              if (!row) return { data: null, error: null };
              Object.assign(row, payload);
              return { data: row, error: null };
            },
          }),
          // setManagerScheduledBroadcastBatchId / markManagerScheduledBroadcastDispatched
          // never call `.select()` -- they resolve straight off the guarded update.
          then: (resolve: (result: { error: null }) => void) => {
            const row = scheduled.find((r) => matches(r, filters) && nullFilters.every((col) => r[col] === null));
            if (row) Object.assign(row, payload);
            resolve({ error: null });
          },
        };
        return chain;
      },
    };
  }

  function batchesTable() {
    return {
      select: () => {
        const filters: [string, unknown][] = [];
        return {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return {
              maybeSingle: async () => ({ data: batches.find((row) => matches(row, filters)) ?? null, error: null }),
            };
          },
        };
      },
    };
  }

  const client = {
    from: (table: string) => {
      if (table === "manager_scheduled_broadcasts") return scheduledTable();
      if (table === "manager_notification_batches") return batchesTable();
      throw new Error(`unexpected table ${table}`);
    },
    rpc: vi.fn(async () => ({ data: [], error: null })),
  };

  return { client, scheduled, batches };
}

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeClient }));
  return import("./store");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function newInput(overrides: Record<string, unknown> = {}) {
  return {
    createIdempotencyKey: "idem-create-1",
    audienceKind: "person" as const,
    targetPersonIds: ["p_1"],
    title: "כותרת",
    body: "תוכן",
    scheduledFor: "2026-08-23T17:00:00.000Z",
    createdByPersonId: "p_manager",
    createdByPersonName: "דני מנהל",
    ...overrides,
  };
}

describe("insertManagerScheduledBroadcastIfAbsent", () => {
  it("inserts a genuinely new row, defaulted to status 'scheduled', and reports created: true", async () => {
    const { client } = makeFakeSupabase();
    const { insertManagerScheduledBroadcastIfAbsent } = await loadModule(client);

    const { row, created } = await insertManagerScheduledBroadcastIfAbsent(newInput());

    expect(created).toBe(true);
    expect(row.status).toBe("scheduled");
    expect(row).toMatchObject({ title: "כותרת", body: "תוכן", createdByPersonId: "p_manager", targetPersonIds: ["p_1"] });
    expect(row.id).toBeTruthy();
  });

  it("a retried insert with the SAME create_idempotency_key returns created: false and the ALREADY-EXISTING row, never a second one", async () => {
    const { client, scheduled } = makeFakeSupabase();
    const { insertManagerScheduledBroadcastIfAbsent } = await loadModule(client);

    const first = await insertManagerScheduledBroadcastIfAbsent(newInput());
    const second = await insertManagerScheduledBroadcastIfAbsent(newInput({ title: "כותרת אחרת בכלל" }));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect(second.row.title).toBe("כותרת"); // the ORIGINAL stored title, never overwritten by the retry's payload
    expect(scheduled).toHaveLength(1);
  });

  it("a DIFFERENT create_idempotency_key genuinely inserts a second, independent row", async () => {
    const { client, scheduled } = makeFakeSupabase();
    const { insertManagerScheduledBroadcastIfAbsent } = await loadModule(client);

    const first = await insertManagerScheduledBroadcastIfAbsent(newInput());
    const second = await insertManagerScheduledBroadcastIfAbsent(newInput({ createIdempotencyKey: "idem-create-2" }));

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.row.id).not.toBe(first.row.id);
    expect(scheduled).toHaveLength(2);
  });

  it("canonicalizes a PostgREST offset-representation scheduled_for on the conflict-lookup path -- a genuine retry must never see a raw representation difference as a mismatch", async () => {
    // Postgres/PostgREST can represent the identical timestamptz instant as
    // '+00:00' instead of the '.000Z' form application code always writes
    // via Date#toISOString() -- simulate that here rather than only ever
    // echoing back exactly what was inserted.
    const { client } = makeFakeSupabase([
      { id: "sb_existing", create_idempotency_key: "idem-offset", scheduled_for: "2026-08-23T17:00:00+00:00" },
    ]);
    const { insertManagerScheduledBroadcastIfAbsent } = await loadModule(client);

    const { row, created } = await insertManagerScheduledBroadcastIfAbsent(newInput({ createIdempotencyKey: "idem-offset" }));

    expect(created).toBe(false);
    expect(row.scheduledFor).toBe("2026-08-23T17:00:00.000Z");
  });
});

describe("getManagerScheduledBroadcastByCreateIdempotencyKey", () => {
  it("returns null for an unknown key", async () => {
    const { client } = makeFakeSupabase();
    const { getManagerScheduledBroadcastByCreateIdempotencyKey } = await loadModule(client);
    expect(await getManagerScheduledBroadcastByCreateIdempotencyKey("nope")).toBeNull();
  });

  it("finds the row by its creation key", async () => {
    const { client } = makeFakeSupabase();
    const { insertManagerScheduledBroadcastIfAbsent, getManagerScheduledBroadcastByCreateIdempotencyKey } = await loadModule(client);
    const { row } = await insertManagerScheduledBroadcastIfAbsent(newInput({ createIdempotencyKey: "idem-lookup" }));

    const found = await getManagerScheduledBroadcastByCreateIdempotencyKey("idem-lookup");
    expect(found?.id).toBe(row.id);
  });

  it("canonicalizes a PostgREST offset-representation scheduled_for the same way, independent of which query path found the row", async () => {
    const { client } = makeFakeSupabase([
      { id: "sb_existing", create_idempotency_key: "idem-offset-2", scheduled_for: "2026-08-23T17:00:00+00:00" },
    ]);
    const { getManagerScheduledBroadcastByCreateIdempotencyKey } = await loadModule(client);

    const found = await getManagerScheduledBroadcastByCreateIdempotencyKey("idem-offset-2");
    expect(found?.scheduledFor).toBe("2026-08-23T17:00:00.000Z");
  });
});

describe("updateManagerScheduledBroadcastIfEditable -- guarded to status = 'scheduled'", () => {
  it("applies the edit while still scheduled", async () => {
    const { client } = makeFakeSupabase([{ id: "sb_1", status: "scheduled", title: "ישן", audience_kind: "person", target_person_ids: ["p_1"] }]);
    const { updateManagerScheduledBroadcastIfEditable } = await loadModule(client);

    const result = await updateManagerScheduledBroadcastIfEditable("sb_1", {
      audienceKind: "person",
      targetPersonIds: ["p_1"],
      title: "חדש",
      body: "תוכן",
      scheduledFor: "2026-08-24T17:00:00.000Z",
      changedByPersonId: "p_manager",
      changedByPersonName: "דני מנהל",
    });

    expect(result?.title).toBe("חדש");
  });

  it("returns null once the row is no longer 'scheduled' -- never silently no-ops on a live claim", async () => {
    const { client } = makeFakeSupabase([{ id: "sb_1", status: "claimed", title: "ישן" }]);
    const { updateManagerScheduledBroadcastIfEditable } = await loadModule(client);

    const result = await updateManagerScheduledBroadcastIfEditable("sb_1", {
      audienceKind: "person",
      targetPersonIds: ["p_1"],
      title: "חדש",
      body: "תוכן",
      scheduledFor: "2026-08-24T17:00:00.000Z",
      changedByPersonId: "p_manager",
      changedByPersonName: "דני מנהל",
    });

    expect(result).toBeNull();
  });
});

describe("cancelManagerScheduledBroadcastIfEditable -- guarded to status = 'scheduled'", () => {
  it("cancels while still scheduled", async () => {
    const { client } = makeFakeSupabase([{ id: "sb_1", status: "scheduled" }]);
    const { cancelManagerScheduledBroadcastIfEditable } = await loadModule(client);

    const result = await cancelManagerScheduledBroadcastIfEditable("sb_1", "p_manager", "דני מנהל");
    expect(result?.status).toBe("cancelled");
  });

  it("fails once already dispatched", async () => {
    const { client } = makeFakeSupabase([{ id: "sb_1", status: "dispatched" }]);
    const { cancelManagerScheduledBroadcastIfEditable } = await loadModule(client);

    const result = await cancelManagerScheduledBroadcastIfEditable("sb_1", "p_manager", "דני מנהל");
    expect(result).toBeNull();
  });
});

describe("listActiveManagerScheduledBroadcasts", () => {
  it("includes 'scheduled' and 'claimed', excludes 'dispatched' and 'cancelled'", async () => {
    const { client } = makeFakeSupabase([
      { id: "sb_scheduled", status: "scheduled" },
      { id: "sb_claimed", status: "claimed" },
      { id: "sb_dispatched", status: "dispatched" },
      { id: "sb_cancelled", status: "cancelled" },
    ]);
    const { listActiveManagerScheduledBroadcasts } = await loadModule(client);

    const rows = await listActiveManagerScheduledBroadcasts();
    expect(rows.map((r) => r.id).sort()).toEqual(["sb_claimed", "sb_scheduled"]);
  });
});

describe("setManagerScheduledBroadcastBatchId -- the dispatch checkpoint, applies exactly once", () => {
  it("sets batch_id the first time", async () => {
    const { client, scheduled } = makeFakeSupabase([{ id: "sb_1", status: "claimed", batch_id: null }]);
    const { setManagerScheduledBroadcastBatchId } = await loadModule(client);

    await setManagerScheduledBroadcastBatchId("sb_1", "batch_1");
    expect(scheduled[0].batch_id).toBe("batch_1");
  });

  it("a second call is a harmless no-op -- the checkpoint is never overwritten", async () => {
    const { client, scheduled } = makeFakeSupabase([{ id: "sb_1", status: "claimed", batch_id: "batch_1" }]);
    const { setManagerScheduledBroadcastBatchId } = await loadModule(client);

    await setManagerScheduledBroadcastBatchId("sb_1", "batch_2");
    expect(scheduled[0].batch_id).toBe("batch_1");
  });
});

describe("markManagerScheduledBroadcastDispatched -- guarded to status = 'claimed'", () => {
  it("transitions a claimed row to dispatched", async () => {
    const { client, scheduled } = makeFakeSupabase([{ id: "sb_1", status: "claimed" }]);
    const { markManagerScheduledBroadcastDispatched } = await loadModule(client);

    await markManagerScheduledBroadcastDispatched("sb_1");
    expect(scheduled[0].status).toBe("dispatched");
  });

  it("never dispatches a row that is not currently 'claimed'", async () => {
    const { client, scheduled } = makeFakeSupabase([{ id: "sb_1", status: "scheduled" }]);
    const { markManagerScheduledBroadcastDispatched } = await loadModule(client);

    await markManagerScheduledBroadcastDispatched("sb_1");
    expect(scheduled[0].status).toBe("scheduled");
  });
});

describe("getManagerNotificationBatchById", () => {
  it("looks the batch up by id, for the dispatch-resume path", async () => {
    const { client } = makeFakeSupabase([], [{ id: "batch_1", idempotency_key: "scheduled:sb_1", audience_kind: "person", title: "כותרת" }]);
    const { getManagerNotificationBatchById } = await loadModule(client);

    const row = await getManagerNotificationBatchById("batch_1");
    expect(row).toMatchObject({ id: "batch_1", title: "כותרת" });
  });

  it("returns null for an unknown id", async () => {
    const { client } = makeFakeSupabase();
    const { getManagerNotificationBatchById } = await loadModule(client);
    expect(await getManagerNotificationBatchById("nope")).toBeNull();
  });
});

describe("claimDueManagerScheduledBroadcasts / claimManagerScheduledBroadcastNow -- thin RPC wrappers", () => {
  it("claimDueManagerScheduledBroadcasts calls the RPC with the given limit and maps rows", async () => {
    const { client } = makeFakeSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: "sb_1", status: "claimed", target_person_ids: [], scheduled_for: "2026-08-23T17:00:00.000Z" }],
      error: null,
    });
    const { claimDueManagerScheduledBroadcasts } = await loadModule(client);

    const rows = await claimDueManagerScheduledBroadcasts(25);
    expect(client.rpc).toHaveBeenCalledWith("claim_due_manager_scheduled_broadcasts", { p_limit: 25 });
    expect(rows).toEqual([expect.objectContaining({ id: "sb_1", status: "claimed" })]);
  });

  it("claimManagerScheduledBroadcastNow returns null when the RPC finds no claimable row", async () => {
    const { client } = makeFakeSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
    const { claimManagerScheduledBroadcastNow } = await loadModule(client);

    expect(await claimManagerScheduledBroadcastNow("sb_1", "p_manager_b", "רותם מנהלת")).toBeNull();
    expect(client.rpc).toHaveBeenCalledWith("claim_manager_scheduled_broadcast_now", {
      p_id: "sb_1",
      p_sent_now_by_person_id: "p_manager_b",
      p_sent_now_by_person_name: "רותם מנהלת",
    });
  });
});
