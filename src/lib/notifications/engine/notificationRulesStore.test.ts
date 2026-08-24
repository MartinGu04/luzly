import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeRow {
  id: string;
  kind: "system" | "custom_weekly";
  system_key: string | null;
  enabled: boolean;
  weekday: number | null;
  local_hour: number;
  local_minute: number;
  title: string | null;
  body: string | null;
  audience_kind: string | null;
  target_person_ids: string[];
  archived_at: string | null;
  created_by_person_id: string | null;
  created_by_person_name: string | null;
  updated_by_person_id: string | null;
  updated_by_person_name: string | null;
  created_at: string;
  updated_at: string;
}

function systemRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: "rule-1",
    kind: "system",
    system_key: "tomorrow_shift",
    enabled: true,
    weekday: null,
    local_hour: 20,
    local_minute: 0,
    title: null,
    body: null,
    audience_kind: null,
    target_person_ids: [],
    archived_at: null,
    created_by_person_id: null,
    created_by_person_name: null,
    updated_by_person_id: null,
    updated_by_person_name: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function customRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: "rule-custom-1",
    kind: "custom_weekly",
    system_key: null,
    enabled: true,
    weekday: 6,
    local_hour: 21,
    local_minute: 0,
    title: "כותרת",
    body: "גוף",
    audience_kind: "everyone",
    target_person_ids: [],
    archived_at: null,
    created_by_person_id: "p_manager",
    created_by_person_name: "מנהל",
    updated_by_person_id: null,
    updated_by_person_name: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * A small, generic in-memory fake for `notification_rules`' own postgrest
 * chains (`.select().is().order()`, `.update().eq().eq().is().select().maybeSingle()`,
 * `.insert().select().single()`) -- accumulates filters/mutation across the
 * fluent chain, applies them at the terminal call, mirroring real
 * postgrest closely enough for behavioral (not wire-format) testing.
 */
function makeFakeNotificationRulesClient(initialRows: FakeRow[] = []) {
  const rows = [...initialRows];

  function matches(row: FakeRow, filters: { column: string; op: "eq" | "is"; value: unknown }[]): boolean {
    return filters.every((filter) => (row as unknown as Record<string, unknown>)[filter.column] === filter.value);
  }

  const client = {
    from: (table: string) => {
      if (table !== "notification_rules") throw new Error(`unexpected table ${table}`);

      function query(filters: { column: string; op: "eq" | "is"; value: unknown }[] = []) {
        return {
          eq: (column: string, value: unknown) => query([...filters, { column, op: "eq" as const, value }]),
          is: (column: string, value: unknown) => query([...filters, { column, op: "is" as const, value }]),
          order: () => ({
            data: rows.filter((row) => matches(row, filters)),
            error: null,
          }),
          maybeSingle: async () => {
            const match = rows.find((row) => matches(row, filters)) ?? null;
            return { data: match, error: null };
          },
        };
      }

      function updateQuery(patch: Record<string, unknown>, filters: { column: string; op: "eq" | "is"; value: unknown }[]) {
        return {
          eq: (column: string, value: unknown) => updateQuery(patch, [...filters, { column, op: "eq" as const, value }]),
          is: (column: string, value: unknown) => updateQuery(patch, [...filters, { column, op: "is" as const, value }]),
          select: () => ({
            maybeSingle: async () => {
              const index = rows.findIndex((row) => matches(row, filters));
              if (index === -1) return { data: null, error: null };
              rows[index] = { ...rows[index], ...(patch as Partial<FakeRow>) };
              return { data: rows[index], error: null };
            },
          }),
        };
      }

      return {
        select: () => query(),
        update: (patch: Record<string, unknown>) => ({
          eq: (column: string, value: unknown) => updateQuery(patch, [{ column, op: "eq" as const, value }]),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const stored: FakeRow = {
                id: `rule-${rows.length + 1}`,
                system_key: null,
                weekday: null,
                title: null,
                body: null,
                audience_kind: null,
                target_person_ids: [],
                archived_at: null,
                created_by_person_id: null,
                created_by_person_name: null,
                updated_by_person_id: null,
                updated_by_person_name: null,
                created_at: "2026-08-24T00:00:00.000Z",
                updated_at: "2026-08-24T00:00:00.000Z",
                ...(row as Partial<FakeRow>),
              } as FakeRow;
              rows.push(stored);
              return { data: stored, error: null };
            },
          }),
        }),
      };
    },
  };

  return { client, rows };
}

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getNotificationServiceClient: () => fakeClient }));
  return import("./store");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("listActiveNotificationRules", () => {
  it("returns both kinds, mapped, and excludes archived rows", async () => {
    const { client } = makeFakeNotificationRulesClient([
      systemRow(),
      customRow(),
      customRow({ id: "rule-archived", archived_at: "2026-08-20T00:00:00.000Z" }),
    ]);
    const { listActiveNotificationRules } = await loadModule(client);

    const result = await listActiveNotificationRules();

    expect(result.map((row) => row.id)).toEqual(["rule-1", "rule-custom-1"]);
    expect(result.find((row) => row.kind === "system")?.systemKey).toBe("tomorrow_shift");
  });
});

describe("updateSystemRule -- guarded to kind = 'system'", () => {
  it("updates enabled/localHour/localMinute of a genuine system row", async () => {
    const { client } = makeFakeNotificationRulesClient([systemRow()]);
    const { updateSystemRule } = await loadModule(client);

    const updated = await updateSystemRule("rule-1", {
      enabled: false,
      localHour: 19,
      localMinute: 30,
      updatedByPersonId: "p_manager",
      updatedByPersonName: "מנהל",
    });

    expect(updated).toMatchObject({ id: "rule-1", enabled: false, localHour: 19, localMinute: 30 });
  });

  it("never updates a custom_weekly row via this path -- returns null (kind guard)", async () => {
    const { client } = makeFakeNotificationRulesClient([customRow()]);
    const { updateSystemRule } = await loadModule(client);

    const updated = await updateSystemRule("rule-custom-1", {
      enabled: false,
      localHour: 19,
      localMinute: 30,
      updatedByPersonId: "p_manager",
      updatedByPersonName: "מנהל",
    });

    expect(updated).toBeNull();
  });

  it("a not-found id returns null", async () => {
    const { client } = makeFakeNotificationRulesClient([]);
    const { updateSystemRule } = await loadModule(client);

    const updated = await updateSystemRule("nope", { enabled: true, localHour: 0, localMinute: 0, updatedByPersonId: "p", updatedByPersonName: "n" });

    expect(updated).toBeNull();
  });
});

describe("insertCustomWeeklyRule", () => {
  it("inserts a new kind = 'custom_weekly' row and returns its mapped shape", async () => {
    const { client, rows } = makeFakeNotificationRulesClient([]);
    const { insertCustomWeeklyRule } = await loadModule(client);

    const row = await insertCustomWeeklyRule({
      weekday: 6,
      localHour: 21,
      localMinute: 0,
      title: "כותרת",
      body: "גוף",
      audienceKind: "everyone",
      targetPersonIds: [],
      createdByPersonId: "p_manager",
      createdByPersonName: "מנהל",
    });

    expect(row).toMatchObject({ kind: "custom_weekly", weekday: 6, title: "כותרת", audienceKind: "everyone" });
    expect(rows).toHaveLength(1);
  });
});

describe("updateCustomWeeklyRule -- guarded to kind = 'custom_weekly' and not archived", () => {
  it("updates a still-active custom rule", async () => {
    const { client } = makeFakeNotificationRulesClient([customRow()]);
    const { updateCustomWeeklyRule } = await loadModule(client);

    const updated = await updateCustomWeeklyRule("rule-custom-1", {
      weekday: 0,
      localHour: 8,
      localMinute: 0,
      title: "כותרת חדשה",
      body: "גוף חדש",
      audienceKind: "everyone",
      targetPersonIds: [],
      updatedByPersonId: "p_manager",
      updatedByPersonName: "מנהל",
    });

    expect(updated).toMatchObject({ weekday: 0, localHour: 8, title: "כותרת חדשה" });
  });

  it("returns null for an already-archived rule -- never revives it back to editable", async () => {
    const { client } = makeFakeNotificationRulesClient([customRow({ archived_at: "2026-08-20T00:00:00.000Z" })]);
    const { updateCustomWeeklyRule } = await loadModule(client);

    const updated = await updateCustomWeeklyRule("rule-custom-1", {
      weekday: 0,
      localHour: 8,
      localMinute: 0,
      title: "x",
      body: "y",
      audienceKind: "everyone",
      targetPersonIds: [],
      updatedByPersonId: "p",
      updatedByPersonName: "n",
    });

    expect(updated).toBeNull();
  });

  it("never updates a system row via this path", async () => {
    const { client } = makeFakeNotificationRulesClient([systemRow()]);
    const { updateCustomWeeklyRule } = await loadModule(client);

    const updated = await updateCustomWeeklyRule("rule-1", {
      weekday: 0,
      localHour: 8,
      localMinute: 0,
      title: "x",
      body: "y",
      audienceKind: "everyone",
      targetPersonIds: [],
      updatedByPersonId: "p",
      updatedByPersonName: "n",
    });

    expect(updated).toBeNull();
  });
});

describe("setCustomWeeklyRuleEnabled / archiveCustomWeeklyRule", () => {
  it("toggles enabled on a still-active custom rule", async () => {
    const { client } = makeFakeNotificationRulesClient([customRow()]);
    const { setCustomWeeklyRuleEnabled } = await loadModule(client);

    const updated = await setCustomWeeklyRuleEnabled("rule-custom-1", false, "p_manager", "מנהל");

    expect(updated).toMatchObject({ enabled: false });
  });

  it("archives a custom rule -- terminal, guarded to not-already-archived", async () => {
    const { client, rows } = makeFakeNotificationRulesClient([customRow()]);
    const { archiveCustomWeeklyRule } = await loadModule(client);

    const archived = await archiveCustomWeeklyRule("rule-custom-1", "p_manager", "מנהל");

    expect(archived).not.toBeNull();
    expect(archived?.archivedAt).not.toBeNull();
    expect(rows[0].archived_at).not.toBeNull();
  });

  it("archiving an already-archived rule is a no-op (returns null), never double-archives", async () => {
    const { client } = makeFakeNotificationRulesClient([customRow({ archived_at: "2026-08-20T00:00:00.000Z" })]);
    const { archiveCustomWeeklyRule } = await loadModule(client);

    const archived = await archiveCustomWeeklyRule("rule-custom-1", "p_manager", "מנהל");

    expect(archived).toBeNull();
  });

  it("neither function ever touches a system row", async () => {
    const { client: clientA } = makeFakeNotificationRulesClient([systemRow()]);
    const { setCustomWeeklyRuleEnabled } = await loadModule(clientA);
    expect(await setCustomWeeklyRuleEnabled("rule-1", false, "p", "n")).toBeNull();

    const { client: clientB } = makeFakeNotificationRulesClient([systemRow()]);
    const { archiveCustomWeeklyRule } = await loadModule(clientB);
    expect(await archiveCustomWeeklyRule("rule-1", "p", "n")).toBeNull();
  });
});
