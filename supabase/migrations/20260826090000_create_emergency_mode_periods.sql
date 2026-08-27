-- Manual, system-level Emergency Mode: durable activation history.
--
-- Emergency Mode is a global operational-world switch (regular shift
-- workbook + duties vs. the emergency shift workbook, desk-based
-- staffing, duties suspended). This migration persists that switch as
-- real activation HISTORY, not a single boolean -- every activation and
-- deactivation is its own row, so "when was Emergency Mode active" can
-- always be answered precisely for audit and for excluding emergency
-- dates from regular shift/duty fairness (see PR spec sections 18-19).
--
-- SERVICE ROLE, deliberately -- same posture as every other internal
-- domain table (`dashboard_visit_state`, `report_one_reserve_inclusion`,
-- `shooting_range_completions`, the notification engine tables): every
-- read/write goes through `src/lib/emergencyMode/store.ts`, itself only
-- reachable via `src/lib/emergencyMode/serviceClient.ts`'s own call to
-- `createSupabaseServiceRoleClient`. Both tables enable RLS with ZERO
-- policies -- default-deny for `anon`/`authenticated`; only the
-- service-role connection (bypasses RLS by Postgres role) can touch them.

-- ---------------------------------------------------------------------
-- emergency_mode_periods -- one row per activation. `deactivated_at`
-- (and the rest of the deactivated_* columns) stay null while a period
-- is the currently active one. `start_date`/`end_date` are Asia/Jerusalem
-- CALENDAR dates (not instants) -- fairness engines exclude every date
-- from `start_date` through `end_date` (or through "today" while still
-- active) inclusive, per the spec's "dates are atomic" rule: a period
-- activated at 14:00 on a date excludes that ENTIRE date, never a
-- partial day.
-- ---------------------------------------------------------------------
create table if not exists public.emergency_mode_periods (
  id uuid primary key default gen_random_uuid(),
  activated_at timestamptz not null default now(),
  activated_by_user_id uuid not null references auth.users (id),
  activated_by_person_id text not null,
  activated_by_person_name text not null,
  start_date date not null,
  deactivated_at timestamptz,
  deactivated_by_user_id uuid references auth.users (id),
  deactivated_by_person_id text,
  deactivated_by_person_name text,
  end_date date,
  created_at timestamptz not null default now()
);

comment on table public.emergency_mode_periods is
  'Real activation history for the manual, system-level Emergency Mode switch -- one row per activation/deactivation cycle. Written ONLY via activate_emergency_mode()/deactivate_emergency_mode() (see the companion RPC migration). Never delete rows: this is the audit trail and the source of truth for which calendar dates are "emergency dates" for regular fairness exclusion.';

-- Belt-and-suspenders DB-level invariant, independent of the RPCs'
-- own application-level check: at most one row may ever have
-- deactivated_at IS NULL (i.e. be "currently active") at a time. A
-- partial unique index on a constant expression, filtered to only rows
-- with deactivated_at is null, means a second such row can never be
-- inserted even if a future bug bypassed the RPC's own locking.
create unique index if not exists emergency_mode_periods_only_one_active
  on public.emergency_mode_periods ((true))
  where deactivated_at is null;

create index if not exists emergency_mode_periods_start_date_idx
  on public.emergency_mode_periods (start_date);

alter table public.emergency_mode_periods enable row level security;

-- ---------------------------------------------------------------------
-- emergency_mode_state -- one singleton row, mirroring
-- `notification_baseline_state`'s pattern exactly. Exists purely so
-- activate_emergency_mode()/deactivate_emergency_mode() have a single
-- row to `select ... for update` and serialize concurrent managers on --
-- see the companion RPC migration's docstring for the full mechanism.
-- `active_period_id` is redundant with "the emergency_mode_periods row
-- with deactivated_at is null" but kept as an explicit FK so a lock on
-- this one row is sufficient to make activate/deactivate atomic without
-- needing an advisory lock or locking the (potentially large, growing)
-- history table itself.
-- ---------------------------------------------------------------------
create table if not exists public.emergency_mode_state (
  id smallint primary key default 1,
  active_period_id uuid references public.emergency_mode_periods (id),
  updated_at timestamptz not null default now(),
  constraint emergency_mode_state_singleton check (id = 1)
);

insert into public.emergency_mode_state (id) values (1)
  on conflict (id) do nothing;

alter table public.emergency_mode_state enable row level security;

-- No RLS policies are declared for either table above -- RLS defaults to
-- deny with zero policies, so `anon`/`authenticated` already see and can
-- change nothing. Only the service-role connection can read/write them.
