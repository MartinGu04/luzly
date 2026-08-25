-- "מטווחים" -- a manager-scheduled future range occurrence for one person.
--
-- One row per (range_date, person_id): a manager schedules a set of people
-- for a range date through mi-ma-mo itself (see
-- `lib/shootingRanges/actions.ts`'s `createPlannedShootingRangeAction`).
-- There is currently no Google Sheet/schedule tab column that represents a
-- FUTURE shooting-range assignment (verified before building this feature
-- -- `lib/domain/event.ts`'s `DutyFamily` has no shooting-range duty type,
-- and the "משמרות + תורנויות" schedule parser recognizes no such
-- assignment either), so this table IS the planned-range data source, not
-- a cache/mirror of one. The "מטווחים" Google Sheet tab itself is used only
-- as the initial qualification BASELINE (`shooting_range_completions`'s own
-- top comment) -- a fully separate concept from a planned occurrence.
--
-- `status`:
--   'planned'       -- not yet resolved by a manager. The read model
--                      (`lib/readModels/shootingRangeQualification.ts`)
--                      derives the user-facing "🎯 מתוכנן" vs
--                      "ממתין לאישור מנהל" distinction purely from whether
--                      `range_date` has passed yet -- never a third stored
--                      status for that.
--   'confirmed'     -- a manager confirmed this person actually completed
--                      the range; a matching `shooting_range_completions`
--                      row (source = 'planned_range_confirmation',
--                      status = 'approved') always exists alongside it.
--   'not_completed' -- a manager reviewed the occurrence and deselected
--                      this person (did not actually participate) --
--                      terminal, never affects baseline; a matching
--                      `shooting_range_completions` row (source =
--                      'planned_range_confirmation', status = 'rejected')
--                      always exists alongside it too.
--
-- Never affects qualification validity by itself in either 'planned' or
-- 'not_completed' state -- only the corresponding APPROVED
-- `shooting_range_completions` row, created at the moment of manager
-- confirmation, can ever update a baseline.
--
-- SERVICE ROLE, same posture and same single call site
-- (`lib/shootingRanges/serviceClient.ts`) as `shooting_range_completions`
-- -- see that migration's own top comment for the full reasoning.
create table if not exists public.shooting_range_planned_occurrences (
  id uuid primary key default gen_random_uuid(),
  range_date date not null,
  person_id text not null,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'not_completed')),
  created_by_person_id text not null,
  created_by_person_name text not null,
  resolved_by_person_id text,
  resolved_by_person_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (range_date, person_id)
);

create index if not exists shooting_range_planned_occurrences_person_id_idx
  on public.shooting_range_planned_occurrences (person_id);

create index if not exists shooting_range_planned_occurrences_range_date_idx
  on public.shooting_range_planned_occurrences (range_date);

comment on table public.shooting_range_planned_occurrences is
  'One row per person scheduled for a shooting-range date via mi-ma-mo. status stays "planned" until a manager resolves it (confirmed/not_completed) after the date passes; the read model derives "pending confirmation" display state purely from range_date having passed while status is still "planned".';

alter table public.shooting_range_planned_occurrences enable row level security;
