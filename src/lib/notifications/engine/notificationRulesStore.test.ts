import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeRow {
  id: string;
  kind: "system" | "custom_weekly";
  system_key: string | null;
  enabled: boolean;
  revision: number;
  weekday: number | null;
  local_hour: number;
  local_minute: number;
  title: string | null;
  body: string | null;
  audience_kind: string | null;
  target_person_ids: string[];
  system_title_override: string | null;
  system_body_override: string | null;
  system_audience_mode: "all_eligible" | "selected";
  system_target_person_ids: string[];
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
    revision: 1,
    weekday: null,
    local_hour: 20,
    local_minute: 0,
    title: null,
    body: null,
    audience_kind: null,
    target_person_ids: [],
    system_title_override: null,
    system_body_override: null,
    system_audience_mode: "all_eligible",
    system_target_person_ids: [],
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
    revision: 1,
    weekday: 6,
    local_hour: 21,
    local_minute: 0,
    title: "כותרת",
    body: "גוף",
    audience_kind: "everyone",
    target_person_ids: [],
    system_title_override: null,
    system_body_override: null,
    system_audience_mode: "all_eligible",
    system_target_person_ids: [],
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
                revision: 1,
                weekday: null,
                title: null,
                body: null,
                audience_kind: null,
                target_person_ids: [],
                system_title_override: null,
                system_body_override: null,
                system_audience_mode: "all_eligible",
                system_target_person_ids: [],
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

describe("updateSystemRule -- atomic rule update + pending-job invalidation via RPC", () => {
  /**
   * A stateful fake for `update_system_rule_configuration_and_invalidate_pending_jobs`
   * that mirrors the real RPC's transactional behavior: update the row
   * only when it's a genuine `kind = 'system'` match, INCREMENT `revision`,
   * then delete every `pendingJobCategories` entry equal to that row's
   * `system_key` -- letting these tests actually prove the atomic
   * invalidation, not just the row mapping.
   */
  function makeFakeSystemRuleUpdateClient(rows: FakeRow[], pendingJobCategories: string[] = []) {
    const pendingJobs = [...pendingJobCategories];
    const rpc = vi.fn(async (fnName: string, params: Record<string, unknown>) => {
      if (fnName !== "update_system_rule_configuration_and_invalidate_pending_jobs") throw new Error(`unexpected rpc ${fnName}`);
      const row = rows.find((candidate) => candidate.id === params.p_rule_id && candidate.kind === "system");
      if (!row) return { data: [], error: null };

      row.enabled = params.p_enabled as boolean;
      row.local_hour = params.p_local_hour as number;
      row.local_minute = params.p_local_minute as number;
      row.system_title_override = (params.p_title_override as string | null) ?? null;
      row.system_body_override = (params.p_body_override as string | null) ?? null;
      row.system_audience_mode = (params.p_audience_mode as "all_eligible" | "selected") ?? "all_eligible";
      row.system_target_person_ids = (params.p_target_person_ids as string[] | null) ?? [];
      row.revision += 1;
      row.updated_by_person_id = params.p_updated_by_person_id as string;
      row.updated_by_person_name = params.p_updated_by_person_name as string;

      const remaining = pendingJobs.filter((category) => category !== row.system_key);
      pendingJobs.length = 0;
      pendingJobs.push(...remaining);

      return { data: [row], error: null };
    });
    return { client: { rpc }, rpc, pendingJobs };
  }

  it("updates enabled/localHour/localMinute of a genuine system row", async () => {
    const { client } = makeFakeSystemRuleUpdateClient([systemRow()]);
    const { updateSystemRule } = await loadModule(client);

    const updated = await updateSystemRule("rule-1", {
      enabled: false,
      localHour: 19,
      localMinute: 30,
      titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p_manager",
      updatedByPersonName: "מנהל",
    });

    expect(updated).toMatchObject({ id: "rule-1", enabled: false, localHour: 19, localMinute: 30 });
  });

  it("persists title/body overrides and the audience mode/targets", async () => {
    const { client } = makeFakeSystemRuleUpdateClient([systemRow()]);
    const { updateSystemRule } = await loadModule(client);

    const updated = await updateSystemRule("rule-1", {
      enabled: true,
      localHour: 20,
      localMinute: 0,
      titleOverride: "כותרת מותאמת",
      bodyOverride: "תוכן מותאם {details}",
      audienceMode: "selected",
      targetPersonIds: ["p_a", "p_b"],
      updatedByPersonId: "p",
      updatedByPersonName: "n",
    });

    expect(updated?.systemTitleOverride).toBe("כותרת מותאמת");
    expect(updated?.systemBodyOverride).toBe("תוכן מותאם {details}");
    expect(updated?.systemAudienceMode).toBe("selected");
    expect(updated?.systemTargetPersonIds).toEqual(["p_a", "p_b"]);
  });

  it("resetting title/body to null clears the override, leaving audience untouched", async () => {
    const { client } = makeFakeSystemRuleUpdateClient([
      systemRow({ system_title_override: "ישן", system_body_override: "ישן גם", system_audience_mode: "selected", system_target_person_ids: ["p_a"] }),
    ]);
    const { updateSystemRule } = await loadModule(client);

    const updated = await updateSystemRule("rule-1", {
      enabled: true,
      localHour: 20,
      localMinute: 0,
      titleOverride: null,
      bodyOverride: null,
      audienceMode: "selected",
      targetPersonIds: ["p_a"],
      updatedByPersonId: "p",
      updatedByPersonName: "n",
    });

    expect(updated?.systemTitleOverride).toBeNull();
    expect(updated?.systemBodyOverride).toBeNull();
    expect(updated?.systemAudienceMode).toBe("selected");
    expect(updated?.systemTargetPersonIds).toEqual(["p_a"]);
  });

  it("increments revision on every edit -- the stale-worker-config guard `upsertPendingSystemReminderJob` checks", async () => {
    const { client } = makeFakeSystemRuleUpdateClient([systemRow({ revision: 1 })]);
    const { updateSystemRule } = await loadModule(client);

    const first = await updateSystemRule("rule-1", { enabled: false, localHour: 19, localMinute: 30, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });
    expect(first?.revision).toBe(2);

    const second = await updateSystemRule("rule-1", { enabled: true, localHour: 19, localMinute: 30, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });
    expect(second?.revision).toBe(3);
  });

  it("increments revision for a COPY-ONLY or AUDIENCE-ONLY edit exactly the same as an enabled/time edit -- the stale-worker guard is content-agnostic, not just enabled/time-agnostic", async () => {
    const { client } = makeFakeSystemRuleUpdateClient([systemRow({ revision: 1, enabled: true, local_hour: 20, local_minute: 0 })]);
    const { updateSystemRule } = await loadModule(client);

    // Enabled/time are UNCHANGED here -- only title/body/audience move.
    const updated = await updateSystemRule("rule-1", {
      enabled: true,
      localHour: 20,
      localMinute: 0,
      titleOverride: "כותרת חדשה",
      bodyOverride: "תוכן חדש",
      audienceMode: "selected",
      targetPersonIds: ["p_a"],
      updatedByPersonId: "p",
      updatedByPersonName: "n",
    });

    expect(updated?.revision).toBe(2); // a stale worker holding revision 1 is refused exactly as if enabled/time had changed
  });

  it("calls the RPC with the exact param names the SQL function expects", async () => {
    const { client, rpc } = makeFakeSystemRuleUpdateClient([systemRow()]);
    const { updateSystemRule } = await loadModule(client);

    await updateSystemRule("rule-1", { enabled: false, localHour: 19, localMinute: 30, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p_manager", updatedByPersonName: "מנהל" });

    expect(rpc).toHaveBeenCalledWith("update_system_rule_configuration_and_invalidate_pending_jobs", {
      p_rule_id: "rule-1",
      p_enabled: false,
      p_local_hour: 19,
      p_local_minute: 30,
      p_title_override: null,
      p_body_override: null,
      p_audience_mode: "all_eligible",
      p_target_person_ids: [],
      p_updated_by_person_id: "p_manager",
      p_updated_by_person_name: "מנהל",
    });
  });

  it("calls the RPC with non-default copy/audience params exactly as given", async () => {
    const { client, rpc } = makeFakeSystemRuleUpdateClient([systemRow()]);
    const { updateSystemRule } = await loadModule(client);

    await updateSystemRule("rule-1", {
      enabled: true,
      localHour: 19,
      localMinute: 30,
      titleOverride: "כותרת מותאמת",
      bodyOverride: "תוכן מותאם {details}",
      audienceMode: "selected",
      targetPersonIds: ["p_a", "p_b"],
      updatedByPersonId: "p_manager",
      updatedByPersonName: "מנהל",
    });

    expect(rpc).toHaveBeenCalledWith("update_system_rule_configuration_and_invalidate_pending_jobs", {
      p_rule_id: "rule-1",
      p_enabled: true,
      p_local_hour: 19,
      p_local_minute: 30,
      p_title_override: "כותרת מותאמת",
      p_body_override: "תוכן מותאם {details}",
      p_audience_mode: "selected",
      p_target_person_ids: ["p_a", "p_b"],
      p_updated_by_person_id: "p_manager",
      p_updated_by_person_name: "מנהל",
    });
  });

  it("atomically invalidates every still-pending job for that exact category", async () => {
    const { client, pendingJobs } = makeFakeSystemRuleUpdateClient(
      [systemRow({ system_key: "tomorrow_shift" })],
      ["tomorrow_shift", "tomorrow_shift", "tomorrow_duty"], // two pending tomorrow_shift jobs, one unrelated
    );
    const { updateSystemRule } = await loadModule(client);

    await updateSystemRule("rule-1", { enabled: false, localHour: 20, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });

    expect(pendingJobs).toEqual(["tomorrow_duty"]); // both tomorrow_shift jobs invalidated, the unrelated one untouched
  });

  it("never updates a custom_weekly row via this path -- returns null (kind guard), and touches no pending jobs", async () => {
    const { client, pendingJobs } = makeFakeSystemRuleUpdateClient([customRow()], ["some_category"]);
    const { updateSystemRule } = await loadModule(client);

    const updated = await updateSystemRule("rule-custom-1", {
      enabled: false,
      localHour: 19,
      localMinute: 30,
      titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p_manager",
      updatedByPersonName: "מנהל",
    });

    expect(updated).toBeNull();
    expect(pendingJobs).toEqual(["some_category"]);
  });

  it("a not-found id returns null", async () => {
    const { client } = makeFakeSystemRuleUpdateClient([]);
    const { updateSystemRule } = await loadModule(client);

    const updated = await updateSystemRule("nope", { enabled: true, localHour: 0, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });

    expect(updated).toBeNull();
  });
});

interface RaceRuleState {
  id: string;
  kind: "system" | "custom_weekly";
  systemKey: string | null;
  enabled: boolean;
  revision: number;
}

/**
 * A single stateful fake spanning ALL THREE RPCs
 * (`update_system_rule_configuration_and_invalidate_pending_jobs`,
 * `upsert_pending_system_reminder_job`, and
 * `cancel_pending_system_reminder_job`), sharing ONE underlying rule/
 * pending-jobs state -- exactly like the real migration's three
 * functions share the same `notification_rules`/`notification_jobs`
 * tables and the SAME row lock on `notification_rules`.
 *
 * Lock ordering is modeled by literal call order: this fake is
 * single-threaded JS, so "whichever transaction's row lock is granted
 * first" is exactly "whichever function a test calls first" -- a test
 * that calls `upsertPendingSystemReminderJob`/`cancelPendingSystemReminderJob`
 * before `updateSystemRule` models the worker-wins-first interleaving;
 * the reverse order models the manager-wins-first interleaving. See the
 * migration's own `upsert_pending_system_reminder_job` and
 * `cancel_pending_system_reminder_job` doc comments for the real
 * Postgres-level proof (based on all three locking the SAME
 * `notification_rules` row first) this mirrors.
 *
 * Note `pendingJobs` models ONLY the `'pending'` rows this fake ever
 * creates -- a job this fake "cancels" is removed from the map
 * entirely (rather than flipped to a `'cancelled'` sub-state), which is
 * an intentional simplification: what these tests need to prove is
 * WHETHER a cancellation was authorized to touch the row at all (the
 * revision/identity guard), not the full downstream terminal-status
 * state machine (already covered elsewhere) -- `.has(dedupeKey)` after
 * a guarded-cancel attempt is exactly "is this still deliverable".
 */
function makeFakeRaceClient(rule: RaceRuleState) {
  const pendingJobs = new Map<string, { category: string; scheduledFor: string }>();
  const rpc = vi.fn(async (fnName: string, params: Record<string, unknown>) => {
    if (fnName === "update_system_rule_configuration_and_invalidate_pending_jobs") {
      if (rule.id !== params.p_rule_id || rule.kind !== "system") return { data: [], error: null };
      rule.enabled = params.p_enabled as boolean;
      rule.revision += 1;
      for (const [key, pendingJob] of pendingJobs) {
        if (pendingJob.category === rule.systemKey) pendingJobs.delete(key);
      }
      return {
        data: [
          {
            id: rule.id,
            kind: rule.kind,
            system_key: rule.systemKey,
            enabled: rule.enabled,
            revision: rule.revision,
            weekday: null,
            local_hour: params.p_local_hour,
            local_minute: params.p_local_minute,
            title: null,
            body: null,
            audience_kind: null,
            target_person_ids: [],
            archived_at: null,
            created_by_person_id: null,
            created_by_person_name: null,
            updated_by_person_id: params.p_updated_by_person_id,
            updated_by_person_name: params.p_updated_by_person_name,
            created_at: "2026-08-24T00:00:00.000Z",
            updated_at: "2026-08-24T00:00:00.000Z",
          },
        ],
        error: null,
      };
    }
    if (fnName === "upsert_pending_system_reminder_job") {
      const authorized =
        rule.id === params.p_rule_id &&
        rule.kind === "system" &&
        rule.systemKey === params.p_category &&
        rule.enabled &&
        rule.revision === params.p_expected_revision;
      if (!authorized) return { data: false, error: null };
      pendingJobs.set(params.p_dedupe_key as string, {
        category: params.p_category as string,
        scheduledFor: params.p_scheduled_for as string,
      });
      return { data: true, error: null };
    }
    if (fnName === "cancel_pending_system_reminder_job") {
      // Deliberately does NOT check `rule.enabled` -- see this
      // function's own real-RPC doc comment for why cancellation
      // authority is identity + exact revision, never enabled state.
      const authorized =
        rule.id === params.p_rule_id && rule.kind === "system" && rule.systemKey === params.p_category && rule.revision === params.p_expected_revision;
      if (!authorized) return { data: false, error: null };
      pendingJobs.delete(params.p_dedupe_key as string); // a no-op if the key was never pending -- exactly like the real WHERE status = 'pending' guard
      return { data: true, error: null };
    }
    throw new Error(`unexpected rpc ${fnName}`);
  });
  return { client: { rpc }, pendingJobs, rule };
}

function raceJob(overrides: Partial<import("./store").NewNotificationJob> = {}): import("./store").NewNotificationJob {
  return {
    category: "tomorrow_shift",
    recipientUserId: "user-a",
    title: "t",
    body: "b",
    path: "/",
    dedupeKey: "tomorrow_shift:2026-08-24:user-a:day",
    scheduledFor: "2026-08-24T17:00:00.000Z",
    sourceRef: "shift:p1:2026-08-24",
    ...overrides,
  };
}

describe("upsertPendingSystemReminderJob + updateSystemRule -- the stale-revision race (FINAL BLOCKER mandatory tests)", () => {
  it("1. STALE WORKER AFTER DISABLE -- a worker's revision-1 upsert attempted AFTER the manager's disable+revision-2 commit is refused; no pending job is created", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { updateSystemRule, upsertPendingSystemReminderJob } = await loadModule(client);

    // Manager disables -- commits FIRST, revision becomes 2, and (per its
    // own atomic invalidation) there is nothing pending to delete yet.
    await updateSystemRule("rule-1", { enabled: false, localHour: 20, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });

    // The stale worker only NOW attempts its revision-1 upsert.
    const wrote = await upsertPendingSystemReminderJob(raceJob(), { ruleId: "rule-1", expectedRevision: 1 });

    expect(wrote).toBe(false);
    expect(pendingJobs.size).toBe(0); // delivery has nothing to claim
  });

  it("2. STALE WORKER AFTER TIME EDIT -- the stale 20:00/revision-1 attempt is refused; a fresh revision-2 tick creates the SAME logical job at 21:00, never two", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { updateSystemRule, upsertPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";

    await updateSystemRule("rule-1", { enabled: true, localHour: 21, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });

    // Stale rev-1 worker still tries to upsert the OLD (20:00) schedule.
    const staleWrite = await upsertPendingSystemReminderJob(
      raceJob({ dedupeKey, scheduledFor: "2026-08-24T17:00:00.000Z" }), // 20:00 Jerusalem (UTC+3)
      { ruleId: "rule-1", expectedRevision: 1 },
    );
    expect(staleWrite).toBe(false);
    expect(pendingJobs.has(dedupeKey)).toBe(false);

    // The category's own next tick reloads the CURRENT revision (2) and re-upserts at the NEW time.
    const freshWrite = await upsertPendingSystemReminderJob(
      raceJob({ dedupeKey, scheduledFor: "2026-08-24T18:00:00.000Z" }), // 21:00 Jerusalem
      { ruleId: "rule-1", expectedRevision: 2 },
    );
    expect(freshWrite).toBe(true);
    expect(pendingJobs.size).toBe(1); // only ONE pending logical job exists
    expect(pendingJobs.get(dedupeKey)?.scheduledFor).toBe("2026-08-24T18:00:00.000Z"); // 20:00 can never deliver
  });

  it("3. WORKER WINS BEFORE MANAGER EDIT -- a revision-1 upsert that commits FIRST is still invalidated by the manager's own same-transaction delete", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { updateSystemRule, upsertPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";

    const wrote = await upsertPendingSystemReminderJob(raceJob({ dedupeKey }), { ruleId: "rule-1", expectedRevision: 1 });
    expect(wrote).toBe(true);
    expect(pendingJobs.has(dedupeKey)).toBe(true);

    // Manager's update commits AFTER -- its own invalidation removes the job the worker just wrote.
    await updateSystemRule("rule-1", { enabled: false, localHour: 20, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });

    expect(pendingJobs.has(dedupeKey)).toBe(false);
  });

  it("3b. STALE WORKER AFTER A COPY-ONLY EDIT (enabled/time unchanged) -- a rev-1 worker's re-materialization attempt is refused exactly like a time/enabled edit would refuse it", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { updateSystemRule, upsertPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";

    // Manager edits ONLY the title/body/audience -- enabled/time stay identical.
    await updateSystemRule("rule-1", {
      enabled: true,
      localHour: 20,
      localMinute: 0,
      titleOverride: "כותרת חדשה אחרי עריכה",
      bodyOverride: "תוכן חדש אחרי עריכה",
      audienceMode: "selected",
      targetPersonIds: ["p_a"],
      updatedByPersonId: "p",
      updatedByPersonName: "n",
    });

    // A worker that loaded revision 1 (the OLD copy) attempts to
    // materialize a job for the SAME dedupe key afterward -- it must never
    // be able to "restore" the old copy under a stale revision.
    const wrote = await upsertPendingSystemReminderJob(raceJob({ dedupeKey }), { ruleId: "rule-1", expectedRevision: 1 });

    expect(wrote).toBe(false);
    expect(pendingJobs.has(dedupeKey)).toBe(false);
  });

  it("4. REVISION MATCH -- an ordinary, uncontested upsert against the current revision of an enabled rule succeeds", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { upsertPendingSystemReminderJob } = await loadModule(client);

    const wrote = await upsertPendingSystemReminderJob(raceJob(), { ruleId: "rule-1", expectedRevision: 1 });

    expect(wrote).toBe(true);
    expect(pendingJobs.size).toBe(1);
  });

  it("5. DISABLED CURRENT REVISION -- even an EXACT revision match is refused once the rule is disabled", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: false, revision: 1 });
    const { upsertPendingSystemReminderJob } = await loadModule(client);

    const wrote = await upsertPendingSystemReminderJob(raceJob(), { ruleId: "rule-1", expectedRevision: 1 });

    expect(wrote).toBe(false);
    expect(pendingJobs.size).toBe(0);
  });

  it("6. WRONG SYSTEM KEY -- a ruleId/category mismatch is refused, never silently writing a job under the wrong rule's identity", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_duty", enabled: true, revision: 1 });
    const { upsertPendingSystemReminderJob } = await loadModule(client);

    const wrote = await upsertPendingSystemReminderJob(raceJob({ category: "tomorrow_shift" }), { ruleId: "rule-1", expectedRevision: 1 });

    expect(wrote).toBe(false);
    expect(pendingJobs.size).toBe(0);
  });
});

describe("cancelPendingSystemReminderJob -- the MIRROR-IMAGE stale-revision race (a stale worker must never cancel a NEWER revision's job)", () => {
  it("1. STALE DISABLED WORKER AFTER RE-ENABLE (the key regression test) -- a rev-1 worker's cancellation attempt after a manager re-enable+rev-2 commit is refused; the rev-2 job survives", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: false, revision: 1 });
    const { updateSystemRule, upsertPendingSystemReminderJob, cancelPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";

    // Worker A loaded revision 1 while disabled -- computed validJobs = []
    // (nothing to upsert; modeled by simply never calling upsert for A).

    // Manager RE-ENABLES -- commits, revision becomes 2.
    await updateSystemRule("rule-1", { enabled: true, localHour: 20, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });

    // Fresh Worker B, loaded with revision 2, correctly creates the now-valid pending job.
    const created = await upsertPendingSystemReminderJob(raceJob({ dedupeKey }), { ruleId: "rule-1", expectedRevision: 2 });
    expect(created).toBe(true);
    expect(pendingJobs.has(dedupeKey)).toBe(true);

    // Stale Worker A's own cancellation sweep now runs -- its validKeys
    // was empty (it thought the rule was disabled), so it treats B's job
    // as "stale" and attempts to cancel it, still carrying revision 1.
    const cancelled = await cancelPendingSystemReminderJob(dedupeKey, { ruleId: "rule-1", category: "tomorrow_shift", expectedRevision: 1 });

    expect(cancelled).toBe(false);
    expect(pendingJobs.has(dedupeKey)).toBe(true); // the CURRENT valid reminder survives -- never destroyed by the old worker
  });

  it("2. STALE OLD-AUDIENCE WORKER -- a stale rev-1 cancellation attempt against a recipient the CURRENT rev-2 config still considers valid no-ops", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { updateSystemRule, upsertPendingSystemReminderJob, cancelPendingSystemReminderJob } = await loadModule(client);
    const dedupeKeyB = "tomorrow_shift:2026-08-24:user-b:day";

    // Manager edit commits -- revision becomes 2 (content/time change, audience itself is domain-derived and unaffected).
    await updateSystemRule("rule-1", { enabled: true, localHour: 21, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });

    // Fresh rev-2 worker creates/keeps recipient B's job.
    await upsertPendingSystemReminderJob(raceJob({ dedupeKey: dedupeKeyB, recipientUserId: "user-b" }), { ruleId: "rule-1", expectedRevision: 2 });
    expect(pendingJobs.has(dedupeKeyB)).toBe(true);

    // The stale rev-1 worker (which considered B stale under its own OLD snapshot) attempts to cancel B.
    const cancelled = await cancelPendingSystemReminderJob(dedupeKeyB, { ruleId: "rule-1", category: "tomorrow_shift", expectedRevision: 1 });

    expect(cancelled).toBe(false);
    expect(pendingJobs.has(dedupeKeyB)).toBe(true);
  });

  it("3. CURRENT REVISION ASSIGNMENT DISAPPEARS -- a genuinely stale key under the UNCHANGED current revision is still cancelled normally (no regression to real reconciliation)", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { upsertPendingSystemReminderJob, cancelPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";

    await upsertPendingSystemReminderJob(raceJob({ dedupeKey }), { ruleId: "rule-1", expectedRevision: 1 });
    expect(pendingJobs.has(dedupeKey)).toBe(true);

    // No manager edit happened -- revision is still 1. The underlying
    // assignment simply disappeared (a shift/duty removed before send),
    // and THIS SAME tick's own cancellation sweep marks it stale.
    const cancelled = await cancelPendingSystemReminderJob(dedupeKey, { ruleId: "rule-1", category: "tomorrow_shift", expectedRevision: 1 });

    expect(cancelled).toBe(true);
    expect(pendingJobs.has(dedupeKey)).toBe(false);
  });

  it("4. CURRENT DISABLED REVISION -- a worker holding the CURRENT (disabled) revision can still cancel that revision's own pending job", async () => {
    const { client, pendingJobs, rule } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: false, revision: 3 });
    const { cancelPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";
    pendingJobs.set(dedupeKey, { category: "tomorrow_shift", scheduledFor: "2026-08-24T17:00:00.000Z" });

    const cancelled = await cancelPendingSystemReminderJob(dedupeKey, { ruleId: "rule-1", category: "tomorrow_shift", expectedRevision: rule.revision });

    expect(cancelled).toBe(true); // succeeds even though enabled = false -- identity + exact revision is the authority, not enabled state
    expect(pendingJobs.has(dedupeKey)).toBe(false);
  });

  it("5. MANAGER UPDATE WINS FIRST -- a stale-revision cancellation attempt can never touch a job created under the NEWER revision", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { updateSystemRule, upsertPendingSystemReminderJob, cancelPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";

    await updateSystemRule("rule-1", { enabled: true, localHour: 20, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" }); // revision -> 2
    await upsertPendingSystemReminderJob(raceJob({ dedupeKey }), { ruleId: "rule-1", expectedRevision: 2 }); // the CURRENT, newer job
    expect(pendingJobs.has(dedupeKey)).toBe(true);

    const cancelled = await cancelPendingSystemReminderJob(dedupeKey, { ruleId: "rule-1", category: "tomorrow_shift", expectedRevision: 1 }); // stale caller

    expect(cancelled).toBe(false);
    expect(pendingJobs.has(dedupeKey)).toBe(true);
  });

  it("6. CANCELLATION WINS FIRST -- a current-revision cancellation that commits before a manager edit leaves no unsafe state once that edit lands", async () => {
    const { client, pendingJobs, rule } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { updateSystemRule, upsertPendingSystemReminderJob, cancelPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";

    await upsertPendingSystemReminderJob(raceJob({ dedupeKey }), { ruleId: "rule-1", expectedRevision: 1 });
    const cancelled = await cancelPendingSystemReminderJob(dedupeKey, { ruleId: "rule-1", category: "tomorrow_shift", expectedRevision: 1 });
    expect(cancelled).toBe(true);
    expect(pendingJobs.has(dedupeKey)).toBe(false);

    // The manager's own (unrelated) edit commits afterward, normally -- its own hard-delete finds nothing left to remove.
    await updateSystemRule("rule-1", { enabled: false, localHour: 20, localMinute: 0, titleOverride: null, bodyOverride: null, audienceMode: "all_eligible" as const, targetPersonIds: [], updatedByPersonId: "p", updatedByPersonName: "n" });

    expect(rule.revision).toBe(2);
    expect(pendingJobs.size).toBe(0);
  });

  it("7. WRONG RULE / CATEGORY -- a ruleId/category mismatch is refused, never cancelling a job under the wrong rule's identity", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_duty", enabled: true, revision: 1 });
    const { cancelPendingSystemReminderJob } = await loadModule(client);
    const dedupeKey = "tomorrow_shift:2026-08-24:user-a:day";
    pendingJobs.set(dedupeKey, { category: "tomorrow_shift", scheduledFor: "2026-08-24T17:00:00.000Z" });

    const cancelled = await cancelPendingSystemReminderJob(dedupeKey, { ruleId: "rule-1", category: "tomorrow_shift", expectedRevision: 1 });

    expect(cancelled).toBe(false);
    expect(pendingJobs.has(dedupeKey)).toBe(true); // untouched
  });

  it("8. CLAIMED / TERMINAL JOB -- an authorized cancellation attempt against a dedupe key that is no longer 'pending' harmlessly no-ops, never errors", async () => {
    const { client, pendingJobs } = makeFakeRaceClient({ id: "rule-1", kind: "system", systemKey: "tomorrow_shift", enabled: true, revision: 1 });
    const { cancelPendingSystemReminderJob } = await loadModule(client);
    // Deliberately never added to `pendingJobs` -- stands in for a job
    // that was already claimed/completed/failed/skipped/cancelled (the
    // real RPC's `where status = 'pending'` guard makes those cases
    // behave identically: authorized, but nothing to touch).
    const dedupeKey = "tomorrow_shift:2026-08-24:user-claimed:day";

    const cancelled = await cancelPendingSystemReminderJob(dedupeKey, { ruleId: "rule-1", category: "tomorrow_shift", expectedRevision: 1 });

    expect(cancelled).toBe(true); // authorized and attempted -- identity/revision matched
    expect(pendingJobs.has(dedupeKey)).toBe(false); // never spuriously created/touched
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

describe("claimNotificationRuleOccurrence / setNotificationRuleOccurrenceBatchId / completeNotificationRuleOccurrence / listCompletedNotificationRuleOccurrenceKeys / listRecoverableNotificationRuleOccurrences", () => {
  function makeFakeOccurrenceClient(rpcResult: { data: unknown; error: unknown } = { data: [], error: null }) {
    const rpc = vi.fn(async () => rpcResult);
    const updateCalls: { table: string; patch: Record<string, unknown>; filters: [string, unknown][] }[] = [];
    let completedRows: { rule_id: string; occurrence_date: string }[] = [];
    let recoverableRows: { rule_id: string; occurrence_date: string }[] = [];
    const selectCalls: { statusFilter: string | null; ltCalls: [string, unknown][] }[] = [];

    function setCompletedRows(rows: { rule_id: string; occurrence_date: string }[]) {
      completedRows = rows;
    }
    function setRecoverableRows(rows: { rule_id: string; occurrence_date: string }[]) {
      recoverableRows = rows;
    }

    const client = {
      rpc,
      from: (table: string) => {
        if (table === "notification_rule_occurrences") {
          return {
            update: (patch: Record<string, unknown>) => {
              const filters: [string, unknown][] = [];
              const builder = {
                eq: (column: string, value: unknown) => {
                  filters.push([column, value]);
                  return builder;
                },
                is: (column: string, value: unknown) => {
                  filters.push([column, value]);
                  return builder;
                },
                then: (resolve: (result: { data: null; error: null }) => void) => {
                  updateCalls.push({ table, patch, filters });
                  resolve({ data: null, error: null });
                },
              };
              return builder;
            },
            select: () => {
              const call: { statusFilter: string | null; ltCalls: [string, unknown][] } = { statusFilter: null, ltCalls: [] };
              selectCalls.push(call);
              const builder = {
                in: () => builder,
                eq: (column: string, value: unknown) => {
                  if (column === "status") call.statusFilter = value as string;
                  return builder;
                },
                lt: (column: string, value: unknown) => {
                  call.ltCalls.push([column, value]);
                  return builder;
                },
                then: (resolve: (result: { data: unknown; error: null }) => void) => {
                  const data = call.statusFilter === "completed" ? completedRows : call.statusFilter === "claimed" ? recoverableRows : [];
                  resolve({ data, error: null });
                },
              };
              return builder;
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    return { client, rpc, updateCalls, setCompletedRows, setRecoverableRows, selectCalls };
  }

  it("claimNotificationRuleOccurrence maps a fresh claim's RPC row, including the frozen createdBy attribution", async () => {
    const { client, rpc } = makeFakeOccurrenceClient({
      data: [
        {
          occurrence_id: "occ-1",
          batch_id: null,
          is_resume: false,
          rule_title: "כותרת",
          rule_body: "גוף",
          rule_audience_kind: "everyone",
          rule_target_person_ids: [],
          created_by_person_id: "p_manager",
          created_by_person_name: "מנהל",
        },
      ],
      error: null,
    });
    const { claimNotificationRuleOccurrence } = await loadModule(client);

    const claim = await claimNotificationRuleOccurrence("rule-1", "2026-08-22");

    expect(claim).toEqual({
      occurrenceId: "occ-1",
      batchId: null,
      isResume: false,
      ruleTitle: "כותרת",
      ruleBody: "גוף",
      ruleAudienceKind: "everyone",
      ruleTargetPersonIds: [],
      createdByPersonId: "p_manager",
      createdByPersonName: "מנהל",
    });
    expect(rpc).toHaveBeenCalledWith("claim_notification_rule_occurrence", { p_rule_id: "rule-1", p_occurrence_date: "2026-08-22" });
  });

  it("claimNotificationRuleOccurrence returns null when the RPC returns zero rows -- already completed, actively leased, or disabled/archived", async () => {
    const { client } = makeFakeOccurrenceClient({ data: [], error: null });
    const { claimNotificationRuleOccurrence } = await loadModule(client);

    expect(await claimNotificationRuleOccurrence("rule-1", "2026-08-22")).toBeNull();
  });

  it("claimNotificationRuleOccurrence maps a resumed claim, including its already-checkpointed batchId", async () => {
    const { client } = makeFakeOccurrenceClient({
      data: [
        {
          occurrence_id: "occ-1",
          batch_id: "batch-1",
          is_resume: true,
          rule_title: "כותרת",
          rule_body: "גוף",
          rule_audience_kind: "everyone",
          rule_target_person_ids: [],
        },
      ],
      error: null,
    });
    const { claimNotificationRuleOccurrence } = await loadModule(client);

    const claim = await claimNotificationRuleOccurrence("rule-1", "2026-08-22");

    expect(claim).toMatchObject({ batchId: "batch-1", isResume: true });
  });

  it("setNotificationRuleOccurrenceBatchId guards to batch_id is null", async () => {
    const { client, updateCalls } = makeFakeOccurrenceClient();
    const { setNotificationRuleOccurrenceBatchId } = await loadModule(client);

    await setNotificationRuleOccurrenceBatchId("occ-1", "batch-1");

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.batch_id).toBe("batch-1");
    expect(updateCalls[0].filters).toContainEqual(["id", "occ-1"]);
    expect(updateCalls[0].filters).toContainEqual(["batch_id", null]);
  });

  it("completeNotificationRuleOccurrence guards to status = 'claimed'", async () => {
    const { client, updateCalls } = makeFakeOccurrenceClient();
    const { completeNotificationRuleOccurrence } = await loadModule(client);

    await completeNotificationRuleOccurrence("occ-1");

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.status).toBe("completed");
    expect(updateCalls[0].filters).toContainEqual(["id", "occ-1"]);
    expect(updateCalls[0].filters).toContainEqual(["status", "claimed"]);
  });

  it("listCompletedNotificationRuleOccurrenceKeys returns an empty set for an empty candidate list without querying", async () => {
    const { client, rpc } = makeFakeOccurrenceClient();
    const { listCompletedNotificationRuleOccurrenceKeys } = await loadModule(client);

    const result = await listCompletedNotificationRuleOccurrenceKeys([]);

    expect(result).toEqual(new Set());
    expect(rpc).not.toHaveBeenCalled();
  });

  it("listCompletedNotificationRuleOccurrenceKeys only returns rows matching an exact (ruleId, date) candidate pair", async () => {
    const { client, setCompletedRows } = makeFakeOccurrenceClient();
    setCompletedRows([
      { rule_id: "rule-1", occurrence_date: "2026-08-22" },
      { rule_id: "rule-2", occurrence_date: "2026-08-15" }, // not a requested candidate -- must be excluded
    ]);
    const { listCompletedNotificationRuleOccurrenceKeys } = await loadModule(client);

    const result = await listCompletedNotificationRuleOccurrenceKeys([
      { ruleId: "rule-1", occurrenceDate: "2026-08-22" },
      { ruleId: "rule-2", occurrenceDate: "2026-08-22" },
    ]);

    expect(result).toEqual(new Set(["rule-1:2026-08-22"]));
  });

  it("listRecoverableNotificationRuleOccurrences returns every still-'claimed' row whose lease is stale, independent of current rule state", async () => {
    const { client, setRecoverableRows } = makeFakeOccurrenceClient();
    setRecoverableRows([
      { rule_id: "rule-1", occurrence_date: "2026-08-22" },
      { rule_id: "rule-2", occurrence_date: "2026-08-15" },
    ]);
    const { listRecoverableNotificationRuleOccurrences } = await loadModule(client);

    const result = await listRecoverableNotificationRuleOccurrences();

    expect(result).toEqual([
      { ruleId: "rule-1", occurrenceDate: "2026-08-22" },
      { ruleId: "rule-2", occurrenceDate: "2026-08-15" },
    ]);
  });

  it("listRecoverableNotificationRuleOccurrences queries status = 'claimed' filtered by claimed_at < (now - leaseSeconds), never joining notification_rules", async () => {
    const { client, selectCalls } = makeFakeOccurrenceClient();
    const { listRecoverableNotificationRuleOccurrences } = await loadModule(client);

    const before = Date.now();
    await listRecoverableNotificationRuleOccurrences(90);
    const after = Date.now();

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].statusFilter).toBe("claimed");
    expect(selectCalls[0].ltCalls).toHaveLength(1);
    const [[column, value]] = selectCalls[0].ltCalls;
    expect(column).toBe("claimed_at");
    const staleBeforeMs = new Date(value as string).getTime();
    expect(staleBeforeMs).toBeGreaterThanOrEqual(before - 90_000 - 1000);
    expect(staleBeforeMs).toBeLessThanOrEqual(after - 90_000 + 1000);
  });

  it("listRecoverableNotificationRuleOccurrences returns an empty array when nothing is stale", async () => {
    const { client } = makeFakeOccurrenceClient();
    const { listRecoverableNotificationRuleOccurrences } = await loadModule(client);

    expect(await listRecoverableNotificationRuleOccurrences()).toEqual([]);
  });
});
