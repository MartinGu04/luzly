-- "דוח 1 למחר" -- מילואים reserve-inclusion toggle (see this repo's
-- Report 1 reserve-inclusion spec). Some reserve (מילואים) personnel
-- exist in the roster but are not currently relevant to Report 1; this
-- table lets a manager mark a reserve person as excluded from the
-- COPIED Report 1 output without removing them from the personnel model
-- and without touching the existing hard exclusion list (דימה מירו /
-- מרטין בדיקות / נדב וקנין), which stays entirely code-level and
-- untouched by this table.
--
-- Deliberately keyed by `person_id` (the SAME stable, name-derived id
-- `stableIdFromName` already mints for every `Person` -- see
-- `lib/parsers/personnel.ts`), NOT `auth.users.id`: this is an org-wide
-- "should this reserve person be copied into Report 1" fact about the
-- PERSON, not a per-viewing-manager display preference -- any manager
-- opening Report 1 must see the SAME inclusion state. One row per
-- reserve person who has EVER had an explicit preference saved; a
-- person with no row here has never been toggled and defaults to
-- included (`true`) at the read layer (`lib/reportOne/store.ts`) --
-- this table itself never stores that default, only explicit
-- overrides, so the very first use of this feature is a no-op (every
-- reserve person stays included exactly as they are today).
--
-- SERVICE ROLE, deliberately, same posture as every other privileged
-- app-state table (`dashboard_visit_state`, `notification_inbox_state`):
-- RLS is enabled with ZERO policies, so even a bypassed/misused
-- browser-authenticated request sees and can change nothing here
-- directly. Every read/write goes through `lib/reportOne/store.ts`
-- (via its own dedicated `lib/reportOne/serviceClient.ts` call site,
-- never a shared one) -- the write path
-- (`setReserveInclusionPreferenceAction`) always re-derives manager
-- authorization server-side AND re-validates the target person against
-- a fresh roster as a genuine, currently-reserve person before writing
-- anything; it never accepts a client-supplied person id at face value.
create table if not exists public.report_one_reserve_inclusion (
  person_id text primary key,
  included boolean not null,
  updated_at timestamptz not null default now(),
  updated_by_person_id text,
  updated_by_person_name text
);

comment on table public.report_one_reserve_inclusion is
  'One row per reserve (מילואים) person who has ever had an explicit "include in Report 1" preference saved. Missing row = never toggled = defaults to included at the read layer. Independent of report_one draft/status text, which is never persisted.';

alter table public.report_one_reserve_inclusion enable row level security;
