-- "מטווחים" (shooting-range qualification) -- application-owned history of
-- VERIFIED range completions. See this repo's מטווחים feature spec for the
-- full product model; the short version:
--
--   VERIFIED completion date -> baseline -> validity expires exactly 6
--   calendar months later (lib/domain/shootingRangeQualification.ts).
--
-- The Google Sheet "מטווחים" tab is the INITIAL baseline source only (read
-- straight off `תאריך ביצוע מטווח`, never copied into this table -- see
-- `lib/parsers/shootingRanges.ts` / `lib/readModels/shootingRangeQualification.ts`).
-- Once a person has at least one row here with status = 'approved', the
-- MOST RECENT such row's `performed_on` is their baseline, UNCONDITIONALLY
-- superseding the sheet -- a later sheet refresh can never revert an
-- app-approved baseline (explicit source precedence, tested in
-- `readModels/shootingRangeQualification.test.ts`).
--
-- One row per completion CLAIM, not per person -- full history, never a
-- single mutable "last range" field. `status` distinguishes:
--   'pending'  -- a self-report awaiting manager review (does NOT affect
--                 baseline).
--   'approved' -- a manager-confirmed completion (the only status that can
--                 ever be a baseline candidate).
--   'rejected' -- a self-report a manager declined, OR a planned occurrence
--                 a manager marked as not actually completed (terminal
--                 state; never affects baseline).
--
-- `source` records how the claim originated:
--   'sheet_baseline'             -- never actually written by this app
--                                   today (see above); reserved so a future
--                                   migration/backfill that DOES want to
--                                   freeze a historical sheet row into
--                                   durable history has a name for it,
--                                   without implying today's read-through
--                                   design writes one.
--   'self_report'                -- "ביצעתי מטווח", pending manager review.
--   'planned_range_confirmation' -- a manager bulk-confirmed (or rejected)
--                                   a scheduled occurrence -- see
--                                   `shooting_range_planned_occurrences`.
--   'manager_manual'             -- a manager records a completion
--                                   directly, with no prior self-report or
--                                   planned occurrence.
--
-- Keyed by `person_id` (the same stable, name-derived id `stableIdFromName`
-- mints for every `Person` -- see `lib/parsers/personnel.ts`), NOT
-- `auth.users.id`: this is an org-wide fact about the PERSON, and a
-- self-report's submitter is not always the same identity that later
-- reads/approves it (the approving manager is a distinct identity).
--
-- SERVICE ROLE, same posture as `report_one_reserve_inclusion` /
-- `dashboard_visit_state`: RLS enabled with ZERO policies, so even a
-- bypassed/misused browser-authenticated request sees and can change
-- nothing here directly. Every read/write goes through
-- `lib/shootingRanges/store.ts` (via its own dedicated
-- `lib/shootingRanges/serviceClient.ts` call site, never a shared one) --
-- every write path re-derives the caller's identity/authorization
-- server-side and re-validates the target person against a freshly-fetched
-- roster before writing anything; a client-supplied person id is never
-- trusted at face value (see `lib/shootingRanges/actions.ts`).
create extension if not exists pgcrypto;

create table if not exists public.shooting_range_completions (
  id uuid primary key default gen_random_uuid(),
  person_id text not null,
  performed_on date not null,
  source text not null check (source in ('sheet_baseline', 'self_report', 'planned_range_confirmation', 'manager_manual')),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  notes text,
  submitted_by_person_id text not null,
  submitted_by_person_name text not null,
  approved_by_person_id text,
  approved_by_person_name text,
  approved_at timestamptz,
  -- Set only for source = 'planned_range_confirmation' -- the scheduled
  -- occurrence date this completion/rejection resolves (see
  -- `shooting_range_planned_occurrences`). Always equal to `performed_on`
  -- for that source; kept as its own explicit column purely for
  -- traceability/documentation ("linkage to planned range if applicable"),
  -- never read as a second source of truth.
  linked_planned_date date,
  created_at timestamptz not null default now()
);

create index if not exists shooting_range_completions_person_id_idx
  on public.shooting_range_completions (person_id);

-- Speeds up "most recent APPROVED row per person" -- the exact lookup the
-- baseline-precedence read model does for every viewed/listed person.
create index if not exists shooting_range_completions_approved_baseline_idx
  on public.shooting_range_completions (person_id, performed_on desc)
  where status = 'approved';

comment on table public.shooting_range_completions is
  'Full history of shooting-range completion claims (pending/approved/rejected). The most recent approved row per person_id is their qualification baseline, unconditionally superseding the Google Sheet baseline. Never a mutable single-row-per-person model.';

alter table public.shooting_range_completions enable row level security;
