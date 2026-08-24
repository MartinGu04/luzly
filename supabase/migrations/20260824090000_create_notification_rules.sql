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
-- claimed.
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
-- ---------------------------------------------------------------------
create table if not exists public.notification_rule_occurrences (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.notification_rules (id),
  -- Asia/Jerusalem local calendar date this occurrence belongs to.
  occurrence_date date not null,
  status text not null default 'claimed',
  batch_id uuid references public.manager_notification_batches (id),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rule_occurrences_unique unique (rule_id, occurrence_date),
  constraint notification_rule_occurrences_status_check check (status in ('claimed', 'completed'))
);

alter table public.notification_rule_occurrences enable row level security;

-- No RLS policies declared -- same "service-role only, default-deny"
-- convention every other notification-engine table already uses.

-- -----------------------------------------------------------------------
-- claim_notification_rule_occurrence -- the ONE atomic claim boundary for
-- a custom weekly rule's occurrence, closing two distinct races at once:
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
-- 2. THE DISABLE/EDIT-BEFORE-CLAIM RACE. A FRESH claim additionally
--    `select ... for update`s the rule's OWN row before ever inserting
--    the occurrence claim, and refuses to claim at all if the rule is,
--    RIGHT NOW, disabled/archived/gone -- never the possibly-stale
--    in-memory rule snapshot `findDueCustomWeeklyOccurrences` computed
--    earlier in the same tick (a manager's disable/edit/archive commits
--    either strictly before this lock is acquired, in which case it's
--    correctly honored below, or it blocks on this SAME row lock until
--    this transaction commits the claim -- at which point the occurrence
--    is already legitimately claimed and the disable only ever prevents
--    the NEXT occurrence). A RESUME of an already-claimed row is
--    deliberately NOT re-gated on the rule's current enabled state --
--    that occurrence was legitimately claimed while the rule WAS enabled
--    at the time, and a later disable must never leave a genuinely
--    in-flight send stuck half-dispatched forever; it finishes
--    idempotently instead, exactly per this feature's own spec.
--
-- Returns the frozen-at-claim rule content (title/body/audience) rather
-- than making the caller re-read `notification_rules` separately, so a
-- concurrent edit that lands AFTER this claim commits can never leak
-- into an in-flight dispatch's content either.
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
  rule_target_person_ids text[]
)
language plpgsql
as $$
declare
  existing_row public.notification_rule_occurrences;
  rule_row public.notification_rules;
  inserted_row public.notification_rule_occurrences;
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

    -- Stale claim -- resume UNCONDITIONALLY (see this function's own doc
    -- comment above for why the rule's current enabled state is
    -- deliberately irrelevant here).
    update public.notification_rule_occurrences
      set claimed_at = now(), updated_at = now()
      where id = existing_row.id;

    select * into rule_row from public.notification_rules where id = p_rule_id;

    return query
      select existing_row.id, existing_row.batch_id, true,
             rule_row.title, rule_row.body, rule_row.audience_kind, rule_row.target_person_ids;
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

  insert into public.notification_rule_occurrences (rule_id, occurrence_date, status, claimed_at)
  values (p_rule_id, p_occurrence_date, 'claimed', now())
  on conflict (rule_id, occurrence_date) do nothing
  returning * into inserted_row;

  if inserted_row.id is null then
    return; -- lost a race to a concurrent fresh claim -- zero rows, safe
  end if;

  return query
    select inserted_row.id, inserted_row.batch_id, false,
           rule_row.title, rule_row.body, rule_row.audience_kind, rule_row.target_person_ids;
end;
$$;

revoke all on function public.claim_notification_rule_occurrence(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_rule_occurrence(uuid, date, integer) to service_role;
