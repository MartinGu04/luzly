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
--  manager-authored. `system_key` is always null for one of these.
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
