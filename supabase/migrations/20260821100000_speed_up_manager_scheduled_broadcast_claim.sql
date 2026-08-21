-- ---------------------------------------------------------------------
-- Minute-level scheduled-broadcast precision follow-up (to PR #79).
--
-- Adjusts `claim_due_manager_scheduled_broadcasts`' pre-checkpoint
-- stale-claim recovery window from 4 minutes down to 90 seconds, and
-- adds a read-only `peek_due_manager_scheduled_broadcasts()`
-- counterpart, to support the new dedicated once-a-minute scheduled-
-- broadcast worker (`POST /internal/notifications/scheduled`)
-- introduced alongside this migration.
--
-- IMPORTANT: this does NOT amend `20260821090000_create_manager_scheduled_broadcasts.sql`
-- (already deployed) -- it's a fresh migration that `create or replace`s
-- the same function, exactly the update path that migration's own doc
-- comment anticipates.
--
-- Why the window needs to shrink: 20260821090000's original 4-minute
-- window was sized for the old architecture, where scheduled-broadcast
-- dispatch only ever ran as one phase of the main 5-minute worker tick
-- -- a crash mid-dispatch could only ever be noticed and retried on the
-- NEXT 5-minute tick anyway, so a 4-minute recovery window added no
-- additional user-visible delay on top of that. Under this PR's new
-- architecture, the dedicated worker is the SOLE normal owner of
-- scheduled-broadcast dispatch (see `pipeline.ts`, which no longer
-- calls `runDueScheduledBroadcastDispatch` at all -- one predictable
-- owner, not two independent claim loops) and runs every minute -- a
-- 4-minute recovery window would silently reintroduce the exact multi-
-- minute dispatch delay this PR exists to eliminate, for the rare case
-- of a crash between claim and batch checkpoint. 90 seconds is
-- comfortably longer than a normal dispatch (audience resolution + job
-- creation for this workbook's roster size takes well under a second in
-- practice) while still recovering within roughly one extra worker tick
-- after a genuine crash, rather than up to four.
--
-- `peek_due_manager_scheduled_broadcasts()` is a read-only, non-claiming
-- mirror of the EXACT SAME three-way eligibility condition the claim
-- function above uses -- so the dedicated worker's cheap "is there
-- anything to do" pre-check (spec: never touch Google/the workbook when
-- there is no work) can never drift out of sync with what the claim
-- function itself would actually pick up. Deliberately a SEPARATE
-- function from `peekDueManagerScheduledBroadcastsCount`'s existing
-- `status = 'scheduled' and scheduled_for <= now()`-only query in
-- store.ts (still used for the dry-run summary estimate) -- that one is
-- a display estimate for a human reading a dry-run response; this one
-- also counts stale/recoverable 'claimed' rows, which the new worker's
-- pre-check must never miss (missing one would mean a crashed dispatch
-- is never resumed until some LATER, unrelated broadcast happens to
-- come due and trigger a real read).
-- ---------------------------------------------------------------------
create or replace function public.claim_due_manager_scheduled_broadcasts(p_limit integer default 50)
returns setof public.manager_scheduled_broadcasts
language plpgsql
as $$
begin
  return query
    update public.manager_scheduled_broadcasts b
      set status = 'claimed', claimed_at = now(), updated_at = now()
      where b.id in (
        select id from public.manager_scheduled_broadcasts
        where (status = 'scheduled' and scheduled_for <= now())
           or (status = 'claimed' and batch_id is not null)
           or (status = 'claimed' and batch_id is null and claimed_at < now() - interval '90 seconds')
        order by scheduled_for
        limit p_limit
        for update skip locked
      )
      returning b.*;
end;
$$;

revoke all on function public.claim_due_manager_scheduled_broadcasts(integer) from public, anon, authenticated;
grant execute on function public.claim_due_manager_scheduled_broadcasts(integer) to service_role;

create or replace function public.peek_due_manager_scheduled_broadcasts()
returns integer
language sql
stable
as $$
  select count(*)::integer from public.manager_scheduled_broadcasts
  where (status = 'scheduled' and scheduled_for <= now())
     or (status = 'claimed' and batch_id is not null)
     or (status = 'claimed' and batch_id is null and claimed_at < now() - interval '90 seconds');
$$;

revoke all on function public.peek_due_manager_scheduled_broadcasts() from public, anon, authenticated;
grant execute on function public.peek_due_manager_scheduled_broadcasts() to service_role;
