-- Fixed / Recurring Notifications Center -- the managed source of truth
-- for (a) every existing fixed/system reminder rule the notification
-- engine already sends, and (b) new manager-created weekly recurring
-- notifications.
--
-- This does NOT replace the delivery engine: `notification_jobs`/
-- `notification_deliveries`/the worker's own trigger logic (who actually
-- has a shift/duty/logistics assignment tomorrow, who is a proven
-- supervisor, עלמ״ש eligibility, ...) are entirely unchanged. This table
-- only owns the CONFIGURATION every fixed rule already implicitly had
-- (enabled/disabled, local send time) plus a NEW kind of rule (a
-- manager-defined weekly broadcast) that reuses the existing manager
-- broadcast/batch/job pipeline for its own dispatch. Same "service-role
-- only, RLS default-deny" convention as every other notification-engine
-- table (see `20260815130000_create_notification_engine.sql`'s own
-- comment) -- there is no direct browser-to-table path either way; every
-- read/write goes through a manager-gated Server Action that uses
-- `getNotificationServiceClient()`.
--
-- Two `kind`s share one table because they share ONE management surface
-- (list/enable/disable, one Manager UI section) even though their
-- execution semantics differ completely:
--
--  'system' -- one row per EXISTING fixed reminder category (`system_key`
--  is the same category string already used as the category/dedupe-key
--  prefix throughout `reminders.ts`, e.g. "tomorrow_shift",
--  "constraints_sunday"). The manager may only toggle `enabled` and the
--  local send time (`local_hour`/`local_minute`) -- WHO gets notified and
--  WHY stays entirely domain-derived in `reminders.ts` (a shift roster
--  lookup, a proven-supervisor resolution, עלמ״ש eligibility, ...), never
--  something this table can express or override. `weekday`/`title`/
--  `body`/`audience_kind`/`target_person_ids` are always null for a
--  system row (enforced by `notification_rules_system_shape_check`
--  below) -- a system rule's trigger/audience/copy is protected code, not
--  configuration.
--
--  'custom_weekly' -- a manager-authored weekly recurring broadcast
--  ("📌 תזכורת לאילוצים every Saturday 21:00" etc.). `weekday` (0=Sunday..
--  6=Saturday, matching `lib/domain/dutyBlocks.ts`'s own `dayOfWeek`),
--  `local_hour`/`local_minute`, `title`, `body`, and `audience_kind`/
--  `target_person_ids` (the SAME `person`/`people`/`everyone` shape
--  `manager_notification_batches.audience_kind` already uses) are all
--  manager-authored. `system_key` is always null for one of these. Each
--  weekly occurrence is dispatched at-most-once through the CLAIM
--  boundary `notification_rule_occurrences`/`claim_notification_rule_occurrence`
--  own further down this file -- see that table's own extensive doc
--  comment for exactly why a `manager_notification_batches` row's mere
--  existence is never a safe "already dispatched" signal on its own.
--
-- Seeding: every existing fixed reminder is inserted below with its
-- CURRENT production send time (see `src/lib/config/notificationTiming.ts`,
-- whose constants remain only as this migration's own seed values --
-- runtime reminder timing is read from this table from this deploy
-- onward, never from that file again). `on conflict (system_key) where
-- kind = 'system' do nothing` makes this idempotent -- safe to
-- re-apply/re-run without ever creating a duplicate system rule or
-- resetting a manager's already-saved edit.
create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  -- Present (and unique) only for kind = 'system' -- the permanent,
  -- protected identity of a fixed reminder category. Never editable once
  -- created (see the trigger below).
  system_key text,
  enabled boolean not null default true,
  -- Monotonic, incremented by `update_system_rule_and_invalidate_pending_jobs`
  -- on every system-rule edit -- the stale-worker-config guard
  -- `upsert_pending_system_reminder_job` re-checks at reminder-job-write
  -- time (see that function's own doc comment below for the exact race
  -- this closes: a reminder worker that loaded this rule's config BEFORE
  -- a manager's concurrent enable/disable/time-edit commits, but only
  -- attempts to materialize a job for it AFTER that edit commits).
  -- Meaningless for a 'custom_weekly' row -- never read there, but kept
  -- as one table-wide column rather than a nullable/system-only one, so
  -- every row always has a well-defined value.
  revision bigint not null default 1,
  -- 0=Sunday..6=Saturday -- required for 'custom_weekly', always null for
  -- 'system' (a system rule's own trigger dates come from domain data,
  -- never a single fixed weekday).
  weekday smallint,
  local_hour smallint not null,
  local_minute smallint not null,
  -- Required for 'custom_weekly' only -- a system rule's copy stays
  -- protected in code (dynamic content, or copy intentionally not opened
  -- to editing in this PR -- see `engine/README.md`).
  title text,
  body text,
  audience_kind text,
  target_person_ids text[] not null default '{}',
  -- 'custom_weekly' only -- an archived custom rule stops appearing in
  -- the active list and dispatch, but its row (and every historical
  -- `notification_jobs`/`manager_notification_batches` row it ever
  -- produced) is never deleted. A system rule is never archived --
  -- disable it instead (see the trigger below, which also forbids this).
  archived_at timestamptz,
  created_by_person_id text,
  created_by_person_name text,
  updated_by_person_id text,
  updated_by_person_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rules_kind_check check (kind in ('system', 'custom_weekly')),
  constraint notification_rules_local_hour_check check (local_hour between 0 and 23),
  constraint notification_rules_local_minute_check check (local_minute between 0 and 59),
  constraint notification_rules_weekday_check check (weekday is null or weekday between 0 and 6),
  constraint notification_rules_audience_kind_check
    check (audience_kind is null or audience_kind in ('person', 'people', 'everyone')),
  -- The one shape guarantee that keeps a 'system' row from ever being
  -- mistaken for (or edited into) a generic weekly broadcast, and vice
  -- versa.
  constraint notification_rules_system_shape_check check (
    (
      kind = 'system'
      and system_key is not null
      and weekday is null
      and title is null
      and body is null
      and audience_kind is null
      and archived_at is null
    )
    or
    (
      kind = 'custom_weekly'
      and system_key is null
      and weekday is not null
      and title is not null
      and body is not null
      and audience_kind is not null
    )
  )
);

-- One row per system category, enforced at the database level (never
-- just "the seed happens to only run once").
create unique index if not exists notification_rules_system_key_unique
  on public.notification_rules (system_key)
  where kind = 'system';

-- The Manager Fixed Notifications Center's own listing query: active
-- (non-archived) rules of either kind.
create index if not exists notification_rules_active_idx
  on public.notification_rules (kind)
  where archived_at is null;

alter table public.notification_rules enable row level security;

-- No RLS policies declared -- same "service-role only, default-deny"
-- convention every other notification-engine table already uses (see
-- `20260815130000_create_notification_engine.sql`'s own comment). Every
-- read/write goes through a manager-gated Server Action using
-- `getNotificationServiceClient()`; there is no direct browser-to-table
-- path for `anon`/`authenticated` either way.

-- ---------------------------------------------------------------------
-- notification_rules_protect_identity -- defense in depth, independent
-- of application-level care in the Server Actions layer: a system rule's
-- `kind`/`system_key` can never change once created, even via a direct
-- service-role update (which bypasses RLS entirely, by Postgres role,
-- not by policy -- this trigger is the one remaining backstop). This is
-- what makes "the manager cannot mutate a system rule into a different
-- trigger type" a database-enforced guarantee, not just a Server Action
-- convention that a future change could accidentally weaken.
-- ---------------------------------------------------------------------
create or replace function public.notification_rules_protect_identity()
returns trigger
language plpgsql
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'notification_rules.kind is immutable (id=%)', old.id;
  end if;
  if new.system_key is distinct from old.system_key then
    raise exception 'notification_rules.system_key is immutable (id=%)', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_rules_protect_identity_trigger on public.notification_rules;
create trigger notification_rules_protect_identity_trigger
  before update on public.notification_rules
  for each row execute function public.notification_rules_protect_identity();

-- ---------------------------------------------------------------------
-- Seed -- every existing fixed reminder category, at its CURRENT
-- production send time (`src/lib/config/notificationTiming.ts`). Order
-- matches that file's own constants. Idempotent: a re-run (or a
-- redeploy of this same migration) never duplicates or resets a row that
-- already exists -- see the partial unique index above.
-- ---------------------------------------------------------------------
insert into public.notification_rules (kind, system_key, enabled, local_hour, local_minute)
values
  ('system', 'tomorrow_shift', true, 20, 0),
  ('system', 'tomorrow_duty', true, 20, 0),
  ('system', 'tomorrow_logistics_withdrawal', true, 20, 0),
  ('system', 'tomorrow_logistics_withdrawal_supervisor', true, 20, 0),
  ('system', 'logistics_withdrawal_noon_assigned', true, 12, 0),
  ('system', 'logistics_withdrawal_noon_supervisor', true, 12, 0),
  ('system', 'logistics_withdrawal_noon_team', true, 12, 0),
  -- Sunday-Friday time only -- Saturday always uses the real astronomical
  -- מוצ״ש instant instead (`lib/time/motzashShabbat.ts`), never this
  -- configured hour/minute; see `reminders.ts`'s own handling. Not
  -- manager-editable away from that Saturday override in this PR.
  ('system', 'almash_check_in', true, 12, 45),
  ('system', 'constraints_sunday', true, 18, 0),
  ('system', 'constraints_monday', true, 9, 0)
on conflict (system_key) where kind = 'system' do nothing;

-- ---------------------------------------------------------------------
-- notification_rule_occurrences -- the at-most-once CLAIM boundary for
-- one custom_weekly rule's one local calendar occurrence
-- (rule_id, occurrence_date). Deliberately a SEPARATE row from
-- `manager_notification_batches`: that batch's own existence is NOT a
-- safe "this occurrence is fully dispatched" signal, because batch
-- creation and per-recipient `notification_jobs` creation are two
-- separate writes -- a crash between them would otherwise leave a
-- half-dispatched occurrence that `notification_rules`'s own dispatch
-- code could never distinguish from a genuinely completed one, silently
-- losing the missing recipients' notifications forever. This table is
-- the ONE terminal-completion source of truth instead: an occurrence is
-- "done" only when `status = 'completed'`, which the application layer
-- (`lib/notifications/engine/recurringRuleDispatch.ts`) sets ONLY after
-- every intended recipient's `notification_jobs` row has been created
-- successfully.
--
-- Lifecycle: no row -> 'claimed' (a fresh claim, see
-- `claim_notification_rule_occurrence` below) -> 'completed' (every job
-- created). A crash while 'claimed' is recovered by a LATER call to the
-- same claim function once its lease (`claimed_at`) goes stale -- same
-- lease-based recovery shape `claim_due_manager_scheduled_broadcasts`
-- already uses for one-time scheduled broadcasts, just keyed by
-- (rule_id, occurrence_date) instead of a pre-existing row id, since a
-- recurring occurrence has no row at all until the moment it's first
-- claimed. Recovery is discoverable INDEPENDENTLY of the rule's current
-- config (see `frozen_*` below) -- a stale 'claimed' row is found by
-- `claimed_at`/`status` alone, never by re-matching the rule's current
-- weekday/time/enabled state, so a claimed-but-crashed occurrence stays
-- resumable even after midnight, a disable, an archive, or a schedule
-- edit (see this table's own `frozen_*` columns and the claim
-- function's own doc comment for exactly why).
--
-- `batch_id` is this row's own dispatch checkpoint, exactly like
-- `manager_scheduled_broadcasts.batch_id`: null means "no batch created
-- yet for this occurrence", non-null means "the batch already exists,
-- resume by reusing its already-frozen recipient set/copy, never
-- re-resolve". This is what makes a crash AFTER batch creation but
-- BEFORE the checkpoint update safe too -- the resumed attempt re-runs
-- `insertManagerNotificationBatchIfAbsent`'s own idempotent insert
-- (`manager_notification_batches.idempotency_key`), which transparently
-- finds the already-created batch rather than creating a second one.
--
-- `frozen_title`/`frozen_body`/`frozen_audience_kind`/
-- `frozen_target_person_ids`/`frozen_created_by_person_id`/
-- `frozen_created_by_person_name` are captured ONCE, at the FRESH claim
-- instant, from the (locked) `notification_rules` row -- and NEVER
-- updated again for that occurrence. A resume reads ONLY these columns,
-- never `notification_rules` again -- so a manager editing the rule's
-- title/body/audience AFTER an occurrence was already claimed can never
-- retroactively change what that already-in-flight occurrence sends;
-- the edit only ever affects the NEXT occurrence. This is the actual
-- "frozen at claim" guarantee -- see the claim function's own doc
-- comment for the bug this closes (a stale resume that re-read mutable
-- `notification_rules` columns could silently change an already-claimed
-- occurrence's meaning).
-- ---------------------------------------------------------------------
create table if not exists public.notification_rule_occurrences (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.notification_rules (id),
  -- Asia/Jerusalem local calendar date this occurrence belongs to.
  occurrence_date date not null,
  status text not null default 'claimed',
  batch_id uuid references public.manager_notification_batches (id),
  frozen_title text not null,
  frozen_body text not null,
  frozen_audience_kind text not null,
  frozen_target_person_ids text[] not null default '{}',
  frozen_created_by_person_id text,
  frozen_created_by_person_name text,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rule_occurrences_unique unique (rule_id, occurrence_date),
  constraint notification_rule_occurrences_status_check check (status in ('claimed', 'completed')),
  constraint notification_rule_occurrences_audience_kind_check
    check (frozen_audience_kind in ('person', 'people', 'everyone'))
);

-- The recovery-discovery query's own access path: every stale-or-fresh
-- 'claimed' row, cheaply, without touching `notification_rules` at all
-- -- see `listRecoverableNotificationRuleOccurrences` (store.ts).
create index if not exists notification_rule_occurrences_claimed_idx
  on public.notification_rule_occurrences (claimed_at)
  where status = 'claimed';

alter table public.notification_rule_occurrences enable row level security;

-- No RLS policies declared -- same "service-role only, default-deny"
-- convention every other notification-engine table already uses.

-- -----------------------------------------------------------------------
-- claim_notification_rule_occurrence -- the ONE atomic claim boundary for
-- a custom weekly rule's occurrence, closing three distinct races at
-- once:
--
-- 1. AT-MOST-ONCE DISPATCH under overlapping workers / retried ticks.
--    A FRESH claim (no existing row yet) is a plain
--    `insert ... on conflict (rule_id, occurrence_date) do nothing` --
--    only one of two concurrent callers can ever win it; the other's
--    insert affects zero rows and this function returns zero rows to it
--    (a safe "someone else has it, do nothing" signal). A RESUME (a row
--    already exists) is only granted when the existing claim's lease
--    (`claimed_at`) has gone stale (`p_lease_seconds`, default 90s,
--    mirroring the scheduled-broadcast claim's own lease window) -- an
--    actively-leased row (another worker genuinely mid-dispatch right
--    now) also returns zero rows, never a concurrent second claim of the
--    same live occurrence. A `'completed'` row always returns zero rows
--    -- the occurrence is genuinely done, forever.
--
-- 2. THE DISABLE/EDIT/ARCHIVE-BEFORE-CLAIM RACE. A FRESH claim
--    additionally `select ... for update`s the rule's OWN row before
--    ever inserting the occurrence claim, and refuses to claim at all
--    unless, RIGHT NOW: the rule exists, is `kind = 'custom_weekly'`,
--    `enabled`, not archived, `p_occurrence_date`'s Asia/Jerusalem
--    weekday matches the rule's CURRENT `weekday`, AND the current
--    instant has actually reached the rule's CURRENT configured local
--    time for that date (computed via a real `AT TIME ZONE
--    'Asia/Jerusalem'` conversion -- never the database/server's
--    implicit timezone). This closes BOTH the disable-before-claim race
--    AND the schedule-edit-before-claim race in one boundary: a stale
--    in-memory candidate computed from an EARLIER tick's rule snapshot
--    (before an edit moved the time later, or to a different weekday)
--    can never slip through here, because this check is against the
--    LOCKED, CURRENT row, never the caller's own possibly-stale
--    `p_occurrence_date`-implies-due assumption. A manager's disable/
--    edit/archive commits either strictly before this lock is acquired
--    (correctly honored below), or blocks on this SAME row lock until
--    this transaction commits the claim (at which point the occurrence
--    is already legitimately claimed, and the edit only ever affects
--    the NEXT occurrence).
--
--    A RESUME of an already-claimed row is deliberately NOT re-gated on
--    ANY of the above (current enabled state, archive state, or
--    schedule) -- that occurrence was legitimately claimed while the
--    rule's config validated at THAT moment, and a later disable/edit/
--    archive must never leave a genuinely in-flight send stuck
--    half-dispatched forever; it finishes idempotently instead, using
--    its own FROZEN content (see below), exactly per this feature's own
--    spec.
--
-- 3. STALE-CONTENT LEAKAGE ON RESUME. A resume returns the occurrence
--    row's OWN `frozen_*` columns (captured once, at the fresh-claim
--    instant) -- it NEVER re-reads `notification_rules` for title/body/
--    audience/target ids. A manager editing the rule's content AFTER
--    this occurrence was already claimed (but before it completed) can
--    therefore never retroactively change what an in-flight occurrence
--    sends.
-- -----------------------------------------------------------------------
create or replace function public.claim_notification_rule_occurrence(
  p_rule_id uuid,
  p_occurrence_date date,
  p_lease_seconds integer default 90
)
returns table (
  occurrence_id uuid,
  batch_id uuid,
  is_resume boolean,
  rule_title text,
  rule_body text,
  rule_audience_kind text,
  rule_target_person_ids text[],
  created_by_person_id text,
  created_by_person_name text
)
language plpgsql
as $$
declare
  existing_row public.notification_rule_occurrences;
  rule_row public.notification_rules;
  inserted_row public.notification_rule_occurrences;
  due_instant timestamptz;
begin
  select * into existing_row from public.notification_rule_occurrences
    where rule_id = p_rule_id and occurrence_date = p_occurrence_date
    for update;

  if found then
    if existing_row.status = 'completed' then
      return; -- genuinely done -- zero rows
    end if;

    if existing_row.claimed_at >= now() - make_interval(secs => p_lease_seconds) then
      return; -- actively leased by another worker right now -- zero rows
    end if;

    -- Stale claim -- resume UNCONDITIONALLY, using the occurrence's OWN
    -- frozen snapshot (see this function's own doc comment above for
    -- why both the rule's current state AND its current content are
    -- deliberately irrelevant here).
    update public.notification_rule_occurrences
      set claimed_at = now(), updated_at = now()
      where id = existing_row.id;

    return query
      select existing_row.id, existing_row.batch_id, true,
             existing_row.frozen_title, existing_row.frozen_body,
             existing_row.frozen_audience_kind, existing_row.frozen_target_person_ids,
             existing_row.frozen_created_by_person_id, existing_row.frozen_created_by_person_name;
    return;
  end if;

  -- Fresh claim -- lock the rule row FIRST so a concurrent disable/edit/
  -- archive (which updates this same row) cannot interleave: see this
  -- function's own doc comment above.
  select * into rule_row from public.notification_rules where id = p_rule_id for update;

  if not found
     or rule_row.kind is distinct from 'custom_weekly'
     or rule_row.enabled is not true
     or rule_row.archived_at is not null
  then
    return; -- disabled/archived/missing RIGHT NOW -- never claim, zero rows
  end if;

  -- Re-validate the CURRENT schedule against the locked row -- a stale
  -- in-memory candidate (computed before a weekday/time edit landed)
  -- must never claim under the OLD schedule. `extract(dow from date)`
  -- is 0=Sunday..6=Saturday, the same convention `rule_row.weekday`
  -- already uses.
  if extract(dow from p_occurrence_date)::smallint is distinct from rule_row.weekday then
    return; -- this date is no longer this rule's configured weekday -- zero rows
  end if;

  due_instant := (p_occurrence_date::timestamp + make_interval(hours => rule_row.local_hour, mins => rule_row.local_minute))
    at time zone 'Asia/Jerusalem';
  if now() < due_instant then
    return; -- the CURRENT configured time hasn't been reached yet -- zero rows
  end if;

  insert into public.notification_rule_occurrences (
    rule_id, occurrence_date, status, claimed_at,
    frozen_title, frozen_body, frozen_audience_kind, frozen_target_person_ids,
    frozen_created_by_person_id, frozen_created_by_person_name
  )
  values (
    p_rule_id, p_occurrence_date, 'claimed', now(),
    rule_row.title, rule_row.body, rule_row.audience_kind, rule_row.target_person_ids,
    rule_row.created_by_person_id, rule_row.created_by_person_name
  )
  on conflict (rule_id, occurrence_date) do nothing
  returning * into inserted_row;

  if inserted_row.id is null then
    return; -- lost a race to a concurrent fresh claim -- zero rows, safe
  end if;

  return query
    select inserted_row.id, inserted_row.batch_id, false,
           inserted_row.frozen_title, inserted_row.frozen_body,
           inserted_row.frozen_audience_kind, inserted_row.frozen_target_person_ids,
           inserted_row.frozen_created_by_person_id, inserted_row.frozen_created_by_person_name;
end;
$$;

revoke all on function public.claim_notification_rule_occurrence(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_rule_occurrence(uuid, date, integer) to service_role;

-- -----------------------------------------------------------------------
-- update_system_rule_and_invalidate_pending_jobs -- the ONE write
-- boundary for a manager's system-rule edit (enable/disable, send-time
-- change). Closes the race where an already-materialized pending
-- `notification_jobs` row (system reminders are upserted ahead of their
-- own send time -- see `reminders.ts`'s `applyReminderJobs`) could still
-- be claimed and delivered by the once-a-minute delivery worker AFTER a
-- manager's disable/time-edit commits but BEFORE the next 5-minute
-- `runReminders()` tick gets a chance to reconcile it (spec: "already-
-- pending UNSENT jobs belonging to that rule must be cancelled/
-- reconciled").
--
-- Atomically, in ONE transaction:
--  1. Updates `notification_rules` (guarded to `kind = 'system'`),
--     INCLUDING incrementing `revision`.
--  2. DELETES every still-`'pending'` `notification_jobs` row whose
--     `category` equals that rule's `system_key` -- deliberately a hard
--     delete, never a soft `status = 'cancelled'`, and deliberately
--     unconditional on date/recipient. A soft cancel was considered and
--     rejected: `upsert_pending_reminder_job`'s own `on conflict ...
--     where status = 'pending'` guard (see
--     `20260819090000_fix_reminder_job_revival.sql`) means a job already
--     marked 'cancelled' can NEVER be revived back to 'pending' by a
--     later tick's normal upsert for the SAME dedupe_key -- so a soft
--     cancel on a TIME EDIT (rule stays enabled, only the time moves)
--     would permanently and silently lose that reminder for the
--     currently-valid recipient(s), which is worse than the original
--     bug. A hard delete has no such trap: the next `runReminders()`
--     tick's normal upsert for that dedupe_key finds no existing row at
--     all and inserts fresh, at the NEW configured time -- a genuine
--     "reconcile", not just a "cancel". For a genuine DISABLE, deleting
--     is equally correct: `runReminders()` will compute zero valid jobs
--     for a disabled category on its next tick, so nothing re-inserts.
--     This never touches `'claimed'`/`'completed'`/`'failed'`/
--     `'skipped'`/`'cancelled'` rows -- a job the delivery worker has
--     already legitimately claimed (or fully resolved) is left alone;
--     ordinary Postgres row-level locking on the `where status =
--     'pending'` DELETE makes this safe against a concurrently-running
--     `claim_due_notification_jobs` without any extra locking here.
--     Deleting an unsent, never-claimed, not-yet-due job also destroys
--     no audit trail: no `notification_deliveries` row can exist for a
--     job that was never claimed, and a still-future `scheduled_for`
--     row was never visible in anyone's inbox yet either (see
--     `getInboxJobsForRecipient`'s own `scheduled_for <= now()` filter).
--  3. Returns the updated rule row.
--
-- Deliberately does NOT recompute/insert the NEW pending job itself --
-- that stays entirely owned by `reminders.ts`'s existing domain-aware
-- upsert logic (this function has no idea which recipients are
-- currently valid for a shift/duty/logistics/almash/constraints
-- category, and must never re-derive that in SQL -- see especially
-- `almash_check_in`, whose Saturday send time is the real astronomical
-- מוצ״ש instant, never a naive static clock time this function could
-- compute). The safety property THIS function guarantees is IMMEDIATE
-- non-deliverability of any job already materialized under the OLD
-- configuration (via the hard delete above). The SEPARATE property that
-- an ALREADY-IN-FLIGHT worker (one that loaded its `NotificationRuleConfig`
-- before this transaction commits) can never re-materialize that same
-- stale job AFTER this commits is guaranteed by the `revision` bump here
-- together with `upsert_pending_system_reminder_job`'s own revision
-- check below -- see that function's doc comment for the full two-sided
-- race and its lock-ordering proof. Rematerialization at the new time/
-- config happens on the next reminder-worker tick, up to that worker's
-- normal cadence later -- a documented, bounded delay, never a
-- correctness gap.
-- -----------------------------------------------------------------------
create or replace function public.update_system_rule_and_invalidate_pending_jobs(
  p_rule_id uuid,
  p_enabled boolean,
  p_local_hour smallint,
  p_local_minute smallint,
  p_updated_by_person_id text,
  p_updated_by_person_name text
)
returns setof public.notification_rules
language plpgsql
as $$
declare
  updated_row public.notification_rules;
begin
  update public.notification_rules
    set enabled = p_enabled,
        local_hour = p_local_hour,
        local_minute = p_local_minute,
        revision = revision + 1,
        updated_by_person_id = p_updated_by_person_id,
        updated_by_person_name = p_updated_by_person_name,
        updated_at = now()
    where id = p_rule_id and kind = 'system'
    returning * into updated_row;

  if updated_row.id is null then
    return; -- not found / not a system row -- zero rows, nothing else touched
  end if;

  delete from public.notification_jobs
    where category = updated_row.system_key and status = 'pending';

  return next updated_row;
end;
$$;

revoke all on function public.update_system_rule_and_invalidate_pending_jobs(uuid, boolean, smallint, smallint, text, text)
  from public, anon, authenticated;
grant execute on function public.update_system_rule_and_invalidate_pending_jobs(uuid, boolean, smallint, smallint, text, text)
  to service_role;

-- -----------------------------------------------------------------------
-- upsert_pending_system_reminder_job -- the ONE write boundary for a
-- SYSTEM reminder category's pending `notification_jobs` row (never the
-- generic `upsert_pending_reminder_job` directly, for any of the 10
-- system categories -- see `reminders.ts`'s `applyReminderJobs`, this
-- function's one caller). Closes the SECOND half of the stale-worker
-- race `update_system_rule_and_invalidate_pending_jobs`'s hard delete
-- alone cannot: that delete only removes an ALREADY-materialized job; it
-- cannot stop a worker that loaded its `NotificationRuleConfig` (and
-- therefore this rule's `enabled`/`local_hour`/`local_minute` AS OF SOME
-- earlier revision) before a manager's concurrent edit commits, but only
-- calls this function AFTER that edit commits -- such a worker would
-- otherwise re-materialize the job it just deleted, right back into
-- existence, under the OLD (now-stale) configuration.
--
-- In ONE transaction:
--  1. Locks the `notification_rules` row at `p_rule_id` FIRST (`select
--     ... for update`) -- the SAME lock `update_system_rule_and_
--     invalidate_pending_jobs`'s own `update` statement takes on that
--     row, so the two functions serialize correctly against each other
--     regardless of which one a concurrent caller happens to invoke
--     first:
--
--       - THIS call's lock is granted first: it authorizes/writes
--         normally (assuming the checks below pass); the manager's
--         update (blocked on the same row lock) commits afterward,
--         incrementing `revision` and deleting every pending job for
--         this category -- including the one THIS call just created.
--         The old configuration's job is gone either way.
--       - The manager's update's lock is granted first: `revision` is
--         already incremented and the row already reflects the NEW
--         enabled/time by the time THIS call's lock is granted, so the
--         checks below fail on the (now-stale) `p_expected_revision`
--         this caller passed in, and this call no-ops.
--
--  2. Requires, against the LOCKED row, all of:
--       - found, `kind = 'system'`
--       - `system_key = p_category` (defense in depth against a
--         mismatched rule id/category pair -- should be unreachable from
--         `reminders.ts`'s own call site, which always derives both from
--         the SAME loaded `SystemRuleConfig`)
--       - `enabled = true`
--       - `revision = p_expected_revision`
--     Any mismatch is a documented, benign no-op -- returns `false`,
--     never raises. The category's own next reminder-worker tick reloads
--     the CURRENT revision/config and reconciles correctly; there is
--     nothing for this caller to retry or recover from.
--  3. Only once authorized: the SAME pending-only upsert
--     `upsert_pending_reminder_job` already uses (`insert ... on
--     conflict (dedupe_key) do update ... where status = 'pending'`) --
--     never revives a claimed/completed/failed/skipped/cancelled job
--     either, exactly like that function.
--
-- Returns `true` when the write was authorized and attempted, `false`
-- for the stale/disabled/mismatched no-op case.
-- -----------------------------------------------------------------------
create or replace function public.upsert_pending_system_reminder_job(
  p_rule_id uuid,
  p_category text,
  p_expected_revision bigint,
  p_recipient_user_id uuid,
  p_title text,
  p_body text,
  p_path text,
  p_tag text,
  p_dedupe_key text,
  p_scheduled_for timestamptz,
  p_source_ref text
)
returns boolean
language plpgsql
as $$
declare
  rule_row public.notification_rules;
begin
  select * into rule_row from public.notification_rules where id = p_rule_id for update;

  if not found
     or rule_row.kind is distinct from 'system'
     or rule_row.system_key is distinct from p_category
     or rule_row.enabled is not true
     or rule_row.revision is distinct from p_expected_revision
  then
    return false; -- stale config / disabled / mismatched -- documented no-op
  end if;

  insert into public.notification_jobs
    (category, recipient_user_id, title, body, path, tag, dedupe_key, scheduled_for, source_ref, status)
  values
    (p_category, p_recipient_user_id, p_title, p_body, p_path, p_tag, p_dedupe_key, p_scheduled_for, p_source_ref, 'pending')
  on conflict (dedupe_key) do update set
    category = excluded.category,
    recipient_user_id = excluded.recipient_user_id,
    title = excluded.title,
    body = excluded.body,
    path = excluded.path,
    tag = excluded.tag,
    scheduled_for = excluded.scheduled_for,
    source_ref = excluded.source_ref,
    updated_at = now()
  where public.notification_jobs.status = 'pending';

  return true;
end;
$$;

revoke all on function public.upsert_pending_system_reminder_job(uuid, text, bigint, uuid, text, text, text, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.upsert_pending_system_reminder_job(uuid, text, bigint, uuid, text, text, text, text, text, timestamptz, text)
  to service_role;

-- -----------------------------------------------------------------------
-- cancel_pending_system_reminder_job -- the ONE write boundary for
-- cancelling a SYSTEM reminder category's own stale pending job (never
-- the generic `cancel_pending_reminder_job`-shaped plain update directly,
-- for any of the 10 system categories -- see `reminders.ts`'s
-- `applyReminderJobs`, this function's one caller). Closes the MIRROR-
-- IMAGE race to `upsert_pending_system_reminder_job`'s own guard: that
-- function stops a STALE worker from re-CREATING a job under an old
-- configuration; this one stops a STALE worker from CANCELLING a job a
-- FRESHER worker (or the manager's own reconciliation) has since created
-- under the CURRENT configuration.
--
-- Real failure this closes: a worker that loaded revision 1 of a
-- currently-DISABLED rule computes zero valid jobs for it. A manager
-- RE-ENABLES the rule (revision becomes 2). A fresh worker, loaded with
-- revision 2, correctly creates the now-valid pending job. If the STALE
-- (revision-1) worker's own stale-key cancellation sweep were still
-- unguarded, it would see that freshly-created job (its own `validKeys`
-- is empty, since it computed zero jobs under the disabled revision-1
-- config) and cancel it -- destroying a job that is not only valid, but
-- was created AFTER this worker's own snapshot went stale. Worse:
-- `upsert_pending_reminder_job`'s (and this function's own) pending-only
-- guard means a `'cancelled'` job can NEVER be revived by a later
-- upsert for the SAME dedupe_key -- so this would not just delay the
-- reminder, it would permanently lose it.
--
-- In ONE transaction:
--  1. Locks the `notification_rules` row at `p_rule_id` FIRST (`select
--     ... for update`) -- the SAME lock `upsert_pending_system_reminder_job`
--     and `update_system_rule_and_invalidate_pending_jobs` both take on
--     that row, so all three functions serialize correctly against each
--     other regardless of call order:
--
--       - THIS call's lock is granted first: it authorizes/cancels
--         normally (assuming the checks below pass); a concurrent
--         manager update (blocked on the same row lock) commits
--         afterward, on its own unrelated revision.
--       - A manager update's lock is granted first: `revision` is
--         already incremented by the time THIS call's lock is granted,
--         so the revision check below fails against this caller's
--         (now-stale) `p_expected_revision`, and this call no-ops --
--         leaving whatever THAT commit did (including any job a
--         concurrently-fresher worker created under the NEW revision)
--         completely untouched.
--
--  2. Requires, against the LOCKED row: found, `kind = 'system'`,
--     `system_key = p_category` (same defense-in-depth
--     `upsert_pending_system_reminder_job` applies), and
--     `revision = p_expected_revision`.
--
--     Deliberately DOES NOT require `enabled = true` (unlike the upsert
--     guard) -- a worker that genuinely loaded the CURRENT revision of a
--     now-DISABLED rule must still be able to clean up THAT revision's
--     own still-pending jobs (e.g. an assignment that disappeared before
--     the rule was disabled). The authority here is rule IDENTITY +
--     exact REVISION match, never enabled state -- `enabled` is exactly
--     the one column the upsert guard checks that this one deliberately
--     does not.
--
--  3. Only once authorized: cancels the matching `notification_jobs` row
--     ONLY if it is still `status = 'pending'` -- the exact same
--     terminal-status protection the existing plain
--     `.eq('dedupe_key', ...).eq('status', 'pending')` update already
--     has; a claimed/completed/failed/skipped/already-cancelled row is
--     left completely untouched either way.
--
-- Returns `true` once authorized/attempted (regardless of whether a
-- `'pending'` row actually existed to cancel -- mirroring
-- `upsert_pending_system_reminder_job`'s own "authorized and attempted"
-- semantics), `false` for the stale-revision/mismatched no-op case.
-- -----------------------------------------------------------------------
create or replace function public.cancel_pending_system_reminder_job(
  p_rule_id uuid,
  p_category text,
  p_expected_revision bigint,
  p_dedupe_key text
)
returns boolean
language plpgsql
as $$
declare
  rule_row public.notification_rules;
begin
  select * into rule_row from public.notification_rules where id = p_rule_id for update;

  if not found
     or rule_row.kind is distinct from 'system'
     or rule_row.system_key is distinct from p_category
     or rule_row.revision is distinct from p_expected_revision
  then
    return false; -- stale revision / mismatched -- documented no-op, never touches notification_jobs
  end if;

  update public.notification_jobs
    set status = 'cancelled'
    where dedupe_key = p_dedupe_key and status = 'pending';

  return true;
end;
$$;

revoke all on function public.cancel_pending_system_reminder_job(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.cancel_pending_system_reminder_job(uuid, text, bigint, text)
  to service_role;
