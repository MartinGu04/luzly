-- activate_emergency_mode / deactivate_emergency_mode -- the ONLY writers
-- of emergency_mode_periods / emergency_mode_state.
--
-- Atomicity mechanism mirrors `advance_notification_baseline` exactly
-- (see `20260815130000_create_notification_engine.sql`): `select ... for
-- update` on the `emergency_mode_state` singleton row serializes
-- concurrent callers on that row's lock, so two managers double-clicking
-- "הפעל מצב חירום" (or "סיים מצב חירום") at the same instant can never
-- both observe "no active period" (or "an active period") for the same
-- transition -- whichever transaction commits first wins and performs
-- the real state change; the second, once unblocked, re-reads the now-
-- current state and correctly reports the idempotent outcome instead.
--
-- No `security definer` needed (same reasoning as
-- `confirm_shooting_range_occurrences`/`advance_notification_baseline`):
-- both functions are granted to `service_role` only, which already
-- bypasses RLS by Postgres role regardless of definer/invoker rights.

-- ---------------------------------------------------------------------
-- activate_emergency_mode -- if no period is currently active, opens a
-- new one and returns 'activated'. If one is already active (including
-- a concurrent caller that just won the race), makes NO changes and
-- returns 'already_active' with that period's own id/activated_at, so a
-- double-click can never create two active periods.
-- ---------------------------------------------------------------------
create or replace function public.activate_emergency_mode(
  p_user_id uuid,
  p_person_id text,
  p_person_name text,
  p_start_date date
)
returns table (status text, period_id uuid, activated_at timestamptz)
language plpgsql
as $$
declare
  state_row public.emergency_mode_state;
  existing_period public.emergency_mode_periods;
  new_period public.emergency_mode_periods;
begin
  select * into state_row from public.emergency_mode_state where id = 1 for update;

  if state_row.active_period_id is not null then
    select * into existing_period from public.emergency_mode_periods where id = state_row.active_period_id;
    return query select 'already_active'::text, existing_period.id, existing_period.activated_at;
    return;
  end if;

  insert into public.emergency_mode_periods (
    activated_at, activated_by_user_id, activated_by_person_id, activated_by_person_name, start_date
  )
  values (now(), p_user_id, p_person_id, p_person_name, p_start_date)
  returning * into new_period;

  update public.emergency_mode_state
    set active_period_id = new_period.id, updated_at = now()
    where id = 1;

  return query select 'activated'::text, new_period.id, new_period.activated_at;
end;
$$;

revoke all on function public.activate_emergency_mode(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.activate_emergency_mode(uuid, text, text, date) to service_role;

-- ---------------------------------------------------------------------
-- deactivate_emergency_mode -- if a period is currently active, closes
-- it and returns 'deactivated'. If none is active (including a
-- concurrent caller that just won the race to close it), makes NO
-- changes and returns 'already_inactive', so a double-click can never
-- corrupt history (e.g. re-closing an already-closed period, or closing
-- the wrong one after a fresh activation raced in between).
-- ---------------------------------------------------------------------
create or replace function public.deactivate_emergency_mode(
  p_user_id uuid,
  p_person_id text,
  p_person_name text,
  p_end_date date
)
returns table (status text, period_id uuid, deactivated_at timestamptz)
language plpgsql
as $$
declare
  state_row public.emergency_mode_state;
  closed_period public.emergency_mode_periods;
begin
  select * into state_row from public.emergency_mode_state where id = 1 for update;

  if state_row.active_period_id is null then
    return query select 'already_inactive'::text, null::uuid, null::timestamptz;
    return;
  end if;

  update public.emergency_mode_periods
    set deactivated_at = now(),
        deactivated_by_user_id = p_user_id,
        deactivated_by_person_id = p_person_id,
        deactivated_by_person_name = p_person_name,
        end_date = p_end_date
    where id = state_row.active_period_id
    returning * into closed_period;

  update public.emergency_mode_state
    set active_period_id = null, updated_at = now()
    where id = 1;

  return query select 'deactivated'::text, closed_period.id, closed_period.deactivated_at;
end;
$$;

revoke all on function public.deactivate_emergency_mode(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.deactivate_emergency_mode(uuid, text, text, date) to service_role;
