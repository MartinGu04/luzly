-- Atomic bulk-confirmation for a manager's מטווחים manager-confirmation
-- flow ("🎯 המטווח של 03.09 הסתיים ... אשר ביצוע ל-11 אנשים").
--
-- Why this needs to be one SQL function, not the application-level
-- read-then-update-then-insert sequence this feature originally shipped
-- with: two concurrent confirmations of the SAME planned occurrence (a
-- double-click, two manager tabs, a client retry racing the original
-- request) could each independently read the same "still planned" rows,
-- then each independently insert an APPROVED `shooting_range_completions`
-- row for the same person/range_date -- a genuine duplicate baseline
-- record, which this feature's own spec explicitly forbids ("no duplicate
-- baseline records"). An application-side pre-check (re-fetching before
-- writing) narrows the window but can never close it -- only a single
-- atomic statement at the database boundary can.
--
-- The fix: `confirm_shooting_range_occurrences` performs BOTH the
-- planned-occurrence status transition AND the resulting
-- `shooting_range_completions` insert inside ONE statement, and drives
-- each insert from that SAME update's own `returning` set -- so a
-- completion is only ever created for a row THIS call itself just flipped
-- out of `'planned'`. A concurrent second call (or a client retry) whose
-- `update ... where status = 'planned'` no longer matches those rows
-- (Postgres re-evaluates the `where` clause after acquiring each row's
-- lock, once the first call's transaction has committed -- see
-- `claim_manager_scheduled_broadcast_now`'s own docstring above for the
-- exact same "plain conditional update is already race-safe" reasoning)
-- affects zero rows for that person, `returning` yields nothing for them,
-- and therefore no second completion is ever inserted -- idempotent by
-- construction, not by a race-prone pre-check.
--
-- `confirmed` vs `not_completed` is determined purely by set membership
-- against `p_confirmed_person_ids` (never by re-reading the OTHER CTE's
-- own write within the same statement -- multiple data-modifying CTEs in
-- one `with` clause never see each other's writes, only their own
-- `returning` output, so `not_completed`'s `where` clause independently
-- excludes `p_confirmed_person_ids` rather than trying to react to
-- `confirmed`'s update).
--
-- Also closes the "do not trust client-supplied person ids" requirement
-- at the database boundary itself, not only in the calling Server Action:
-- an id in `p_confirmed_person_ids` that isn't ACTUALLY a `'planned'` row
-- for `p_range_date` simply matches nothing here (0 rows updated, 0 rows
-- returned, 0 completions inserted for it) -- it is structurally
-- impossible for a foreign/stale id to fabricate a completion.
--
-- No `security definer` needed (unlike `upsert_push_subscription`'s RPC):
-- this function is granted to `service_role` only, which already bypasses
-- RLS regardless -- see `claim_due_manager_scheduled_broadcasts`/
-- `claim_manager_scheduled_broadcast_now` above for the same convention.
create or replace function public.confirm_shooting_range_occurrences(
  p_range_date date,
  p_confirmed_person_ids text[],
  p_resolver_person_id text,
  p_resolver_person_name text
)
returns table (person_id text, resolved_status text)
language plpgsql
as $$
begin
  return query
  with confirmed as (
    update public.shooting_range_planned_occurrences
      set status = 'confirmed',
          resolved_by_person_id = p_resolver_person_id,
          resolved_by_person_name = p_resolver_person_name,
          resolved_at = now()
      where range_date = p_range_date
        and status = 'planned'
        and shooting_range_planned_occurrences.person_id = any(p_confirmed_person_ids)
      returning shooting_range_planned_occurrences.person_id
  ),
  not_completed as (
    update public.shooting_range_planned_occurrences
      set status = 'not_completed',
          resolved_by_person_id = p_resolver_person_id,
          resolved_by_person_name = p_resolver_person_name,
          resolved_at = now()
      where range_date = p_range_date
        and status = 'planned'
        and not (shooting_range_planned_occurrences.person_id = any(p_confirmed_person_ids))
      returning shooting_range_planned_occurrences.person_id
  ),
  inserted_confirmed as (
    insert into public.shooting_range_completions (
      person_id, performed_on, source, status,
      submitted_by_person_id, submitted_by_person_name,
      approved_by_person_id, approved_by_person_name, approved_at,
      linked_planned_date
    )
    select c.person_id, p_range_date, 'planned_range_confirmation', 'approved',
           p_resolver_person_id, p_resolver_person_name,
           p_resolver_person_id, p_resolver_person_name, now(),
           p_range_date
    from confirmed c
    returning shooting_range_completions.person_id
  ),
  inserted_rejected as (
    insert into public.shooting_range_completions (
      person_id, performed_on, source, status,
      submitted_by_person_id, submitted_by_person_name,
      approved_by_person_id, approved_by_person_name, approved_at,
      linked_planned_date
    )
    select n.person_id, p_range_date, 'planned_range_confirmation', 'rejected',
           p_resolver_person_id, p_resolver_person_name,
           p_resolver_person_id, p_resolver_person_name, now(),
           p_range_date
    from not_completed n
    returning shooting_range_completions.person_id
  )
  select inserted_confirmed.person_id, 'confirmed'::text from inserted_confirmed
  union all
  select inserted_rejected.person_id, 'not_completed'::text from inserted_rejected;
end;
$$;

revoke all on function public.confirm_shooting_range_occurrences(date, text[], text, text) from public, anon, authenticated;
grant execute on function public.confirm_shooting_range_occurrences(date, text[], text, text) to service_role;
