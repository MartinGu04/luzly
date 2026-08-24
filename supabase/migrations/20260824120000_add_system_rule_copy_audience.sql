-- Editable SYSTEM notification copy + audience filtering -- follow-up to
-- the Fixed / Recurring Notifications Center (`20260824090000_create_
-- notification_rules.sql`, ALREADY APPLIED TO PRODUCTION -- never amend
-- that file; this is a separate, additive migration).
--
-- Lets a manager, for any `kind = 'system'` row, additionally configure:
--  - an optional title override (`system_title_override`)
--  - an optional body override/template (`system_body_override`)
--  - an audience FILTER over the rule's own domain-derived eligible
--    recipients (`system_audience_mode` + `system_target_person_ids`) --
--    this can only ever NARROW who receives a system reminder, never
--    expand it: the application layer (`reminders.ts`) always computes
--    the real domain-eligible set FIRST (who actually has a shift/duty/
--    logistics assignment tomorrow, who is a proven supervisor, who is
--    non-permanent for constraints, ...) and applies this filter ON TOP
--    of it, never in place of it. See `isSystemRulePersonAllowed`
--    (`ruleConfig.ts`).
--
-- All four new columns default to values that reproduce CURRENT
-- production behavior exactly: `null` override = the existing built-in
-- copy, `'all_eligible'` = every domain-eligible person (today's only
-- behavior), empty `system_target_person_ids`. Merely applying this
-- migration changes zero outgoing notifications.
alter table public.notification_rules
  add column if not exists system_title_override text,
  add column if not exists system_body_override text,
  add column if not exists system_audience_mode text not null default 'all_eligible',
  add column if not exists system_target_person_ids text[] not null default '{}';

comment on column public.notification_rules.system_title_override is
  'System rule only. NULL = use the built-in title unchanged. Non-null replaces it outright (both static and dynamic-body categories).';
comment on column public.notification_rules.system_body_override is
  'System rule only. NULL = use the built-in body unchanged. For a static-body category (see the presentation-layer catalog''s bodyKind), a non-null value replaces the body outright. For a dynamic-body category, a non-null value is a TEMPLATE that must contain exactly one literal "{details}" placeholder -- validated server-side (ruleActions.ts) before save -- which is substituted with the existing trusted dynamically-generated body at send time (applySystemRuleCopy, engine/systemRuleCopy.ts). Never a general-purpose template language -- "{details}" is the one supported placeholder.';
comment on column public.notification_rules.system_audience_mode is
  '''all_eligible'' (default, current behavior) or ''selected''. A FILTER over the rule''s real domain-eligible recipients, never a replacement for domain eligibility -- see this migration''s own top-of-file comment.';
comment on column public.notification_rules.system_target_person_ids is
  'Stable roster person ids (never Supabase auth user ids) selected by the manager when system_audience_mode = ''selected''. Re-validated against the CURRENT roster at both save time (ruleActions.ts) and send time (isSystemRulePersonAllowed) -- a person who later disappears from the roster is silently skipped, never guessed at, never failing the whole rule.';

alter table public.notification_rules
  add constraint notification_rules_system_audience_mode_check
  check (system_audience_mode in ('all_eligible', 'selected'));

-- ---------------------------------------------------------------------
-- Widen the existing shape guarantee (originally added by the PR #93
-- migration, altered here rather than editing that already-applied file)
-- so the four new columns stay correctly scoped: a 'custom_weekly' row
-- (which has its OWN title/body/audience_kind/target_person_ids columns
-- for the exact same purpose) can never carry a non-default value in any
-- of the new SYSTEM-only columns either.
-- ---------------------------------------------------------------------
alter table public.notification_rules drop constraint notification_rules_system_shape_check;
alter table public.notification_rules add constraint notification_rules_system_shape_check check (
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
    and system_title_override is null
    and system_body_override is null
    and system_audience_mode = 'all_eligible'
    and system_target_person_ids = '{}'
  )
);

-- -----------------------------------------------------------------------
-- update_system_rule_configuration_and_invalidate_pending_jobs -- the
-- enhanced write boundary for a manager's system-rule edit, superseding
-- `update_system_rule_and_invalidate_pending_jobs` (PR #93) for every
-- EDIT the new app performs, now covering enabled/time AND copy
-- (title/body override) AND audience (mode/target ids) in one call.
--
-- `update_system_rule_and_invalidate_pending_jobs` is DELIBERATELY LEFT
-- IN PLACE, unmodified -- dropping or changing its signature would break
-- an already-deployed OLD app instance still calling it during the
-- window between this migration landing in production and the new app
-- build actually deploying (rollout safety: "the old deployed app must
-- continue working between steps 3 and 5" -- see this migration's own
-- top-of-file comment). The new app's `updateSystemRule` (store.ts)
-- calls ONLY this function from here on; the old one becomes dead code
-- once the new app is live, never removed by this migration.
--
-- Atomically, in ONE transaction (identical invalidation semantics to
-- the PR #93 RPC -- see that function's own extensive doc comment for
-- the full reasoning, unchanged here):
--  1. Locks the target row (`select ... for update`, the SAME pattern
--     `upsert_pending_system_reminder_job`/`cancel_pending_system_reminder_job`
--     already use) and requires BOTH `kind = 'system'` AND the row's
--     CURRENT `revision` to still equal `p_expected_revision` -- this is
--     an OPTIMISTIC CONCURRENCY CHECK on the MANAGER EDIT itself, not
--     just the worker-side guards below. Without it, two Managers (or
--     one Manager's quick enable/disable toggle firing with a page it
--     loaded before someone else's edit) can race: Manager A loads
--     revision 4, Manager B saves a copy/audience change (revision 5),
--     then Manager A's own still-revision-4 save (even a "just disable
--     it" toggle, since the update is full-state) silently overwrites
--     B's change and stamps revision 6 -- a lost update. Requiring the
--     caller's OWN previously-loaded revision to still match closes this
--     the same way `p_expected_revision` already closes the equivalent
--     worker-side race.
--  2. On a stale `p_expected_revision` (or a not-found/non-system id),
--     returns ZERO rows and touches NOTHING else -- no column write, no
--     `notification_jobs` deletion. The caller (`store.ts`) distinguishes
--     "stale revision" from genuine "not found" with a follow-up plain
--     read, since this function's own zero-rows return means the same
--     thing either way at the SQL level.
--  3. Otherwise updates `notification_rules`: enabled, local_hour,
--     local_minute, system_title_override, system_body_override,
--     system_audience_mode, system_target_person_ids, audit metadata,
--     AND increments `revision`.
--  4. Hard-deletes every still-`'pending'` `notification_jobs` row for
--     that category -- a content OR audience edit must never leave an
--     already-materialized job deliverable under the OLD title/body/
--     audience any more than an enabled/time edit could. Same hard-
--     delete-not-soft-cancel reasoning as PR #93 (revival trap in
--     `upsert_pending_reminder_job`'s own guard). Never reached on a
--     stale-revision no-op (see 2 above) -- a losing Manager edit must
--     never invalidate jobs that belong to the WINNING (current) revision.
--  5. Returns the updated rule row.
--
-- The existing revision-guarded write boundary
-- (`upsert_pending_system_reminder_job` / `cancel_pending_system_reminder_job`,
-- PR #93) needs NO changes to keep protecting against a stale WORKER
-- under this wider edit surface: both already gate on the row's CURRENT
-- `revision`, and this function increments `revision` for every field
-- covered here (not just enabled/time), so a worker holding a
-- config snapshot from before ANY of these fields changed is refused
-- exactly the same way a worker holding a stale enabled/time snapshot
-- already was. The NEW `p_expected_revision` check added here is a
-- SEPARATE, additional guard, on the MANAGER's own write path, closing
-- the lost-update race described in point 1 above -- neither guard
-- substitutes for the other.
-- -----------------------------------------------------------------------
create or replace function public.update_system_rule_configuration_and_invalidate_pending_jobs(
  p_rule_id uuid,
  p_expected_revision bigint,
  p_enabled boolean,
  p_local_hour smallint,
  p_local_minute smallint,
  p_title_override text,
  p_body_override text,
  p_audience_mode text,
  p_target_person_ids text[],
  p_updated_by_person_id text,
  p_updated_by_person_name text
)
returns setof public.notification_rules
language plpgsql
as $$
declare
  rule_row public.notification_rules;
  updated_row public.notification_rules;
begin
  select * into rule_row from public.notification_rules where id = p_rule_id for update;

  if not found or rule_row.kind is distinct from 'system' then
    return; -- not found / not a system row -- zero rows, nothing else touched
  end if;

  if rule_row.revision is distinct from p_expected_revision then
    return; -- stale Manager edit -- documented no-op, never touches notification_jobs
  end if;

  update public.notification_rules
    set enabled = p_enabled,
        local_hour = p_local_hour,
        local_minute = p_local_minute,
        system_title_override = p_title_override,
        system_body_override = p_body_override,
        system_audience_mode = p_audience_mode,
        system_target_person_ids = coalesce(p_target_person_ids, '{}'),
        revision = revision + 1,
        updated_by_person_id = p_updated_by_person_id,
        updated_by_person_name = p_updated_by_person_name,
        updated_at = now()
    where id = p_rule_id
    returning * into updated_row;

  delete from public.notification_jobs
    where category = updated_row.system_key and status = 'pending';

  return next updated_row;
end;
$$;

revoke all on function public.update_system_rule_configuration_and_invalidate_pending_jobs(
  uuid, bigint, boolean, smallint, smallint, text, text, text, text[], text, text
) from public, anon, authenticated;
grant execute on function public.update_system_rule_configuration_and_invalidate_pending_jobs(
  uuid, bigint, boolean, smallint, smallint, text, text, text, text[], text, text
) to service_role;
