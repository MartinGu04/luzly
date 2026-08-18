-- Hotfix: a completed/failed/skipped/cancelled reminder job could be
-- silently revived back to 'pending' by a LATER worker tick's reminder
-- upsert -- confirmed in Production on a real tomorrow_shift job (all 5
-- device deliveries succeeded on the first tick; five subsequent ticks
-- each re-flipped the already-completed job back to 'pending', re-claimed
-- it, incremented its attempts, found every delivery already 'sent' (so
-- nothing was actually re-sent), and set it back to 'completed' -- until
-- attempts reached max_attempts, at which point claim_due_notification_jobs'
-- own `attempts < max_attempts` guard made the job permanently unclaimable
-- while its status was mid-revival at 'pending', leaving it stuck exactly
-- as observed: status='pending', attempts=5/5, error=null, 5 'sent'
-- deliveries each with exactly 1 attempt).
--
-- Root cause: `upsertPendingReminderJob` (src/lib/notifications/engine/
-- store.ts) called `.upsert({...status:'pending'}, {onConflict:
-- 'dedupe_key'}).eq('status','pending')`, on the (incorrect, now proven
-- wrong) assumption that the chained `.eq()` restricts PostgREST's
-- generated `INSERT ... ON CONFLICT (dedupe_key) DO UPDATE SET ...` to
-- only fire against an existing row that is still 'pending'. It does not
-- -- PostgREST request-level filters are not applied as a WHERE guard on
-- a merge-duplicates upsert's conflict action, so every tick's upsert for
-- the same dedupe_key (every reminder category recomputes and re-upserts
-- its still-relevant jobs on EVERY tick, by design, so their content can
-- refresh before send) unconditionally reset status back to 'pending' and
-- overwrote every other column, regardless of the row's actual current
-- status.
--
-- Fix: a real Postgres `ON CONFLICT ... DO UPDATE ... WHERE` guard,
-- expressed directly in SQL rather than relied upon (incorrectly) from a
-- PostgREST client-side filter -- the same reason this migration's own
-- `claim_due_notification_jobs`/`advance_notification_baseline` already
-- exist as dedicated functions rather than plain client calls: some
-- atomic guarantees can only be expressed this way. `status` is
-- deliberately NEVER included in the `DO UPDATE SET` list -- the WHERE
-- clause already guarantees it is 'pending' whenever the UPDATE actually
-- fires, so there is no reason (and no path) for this function to ever
-- write a `status` value itself. When the existing row is NOT 'pending',
-- the WHERE clause makes the conflicting UPDATE a no-op: no row is
-- inserted (a real row already exists), no row is updated (the guard
-- failed) -- the existing terminal job is left completely untouched, its
-- own delivery history intact.
--
-- Every OTHER reminder-lifecycle write already uses a real WHERE guard on
-- a plain UPDATE (`cancelPendingReminderJob`: `.update(...).eq('dedupe_key',
-- ...).eq('status','pending')`), which is NOT subject to this same bug --
-- PostgREST filters DO apply correctly to PATCH/UPDATE requests, only a
-- POST/upsert's ON CONFLICT DO UPDATE ignores them. Semantic-change jobs
-- (shift_change/team_change/duty_change/coverage_gap, `insertNotification
-- JobIfAbsent`) are unaffected for an unrelated reason: they use a plain
-- INSERT and treat a unique_violation (23505) on a duplicate dedupe_key as
-- "already exists, do nothing" -- the existing row, whatever its status,
-- is never touched at all on a duplicate attempt.

create or replace function public.upsert_pending_reminder_job(
  p_category text,
  p_recipient_user_id uuid,
  p_title text,
  p_body text,
  p_path text,
  p_tag text,
  p_dedupe_key text,
  p_scheduled_for timestamptz,
  p_source_ref text
)
returns void
language sql
as $$
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
$$;

revoke all on function public.upsert_pending_reminder_job(text, uuid, text, text, text, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.upsert_pending_reminder_job(text, uuid, text, text, text, text, text, timestamptz, text)
  to service_role;
