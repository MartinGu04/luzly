-- Dynamic audience GROUPS + explicit EXCLUSIONS -- follow-up to the Fixed /
-- Recurring Notifications Center's editable-copy/audience-filtering
-- migration (`20260824120000_add_system_rule_copy_audience.sql`, ALREADY
-- APPLIED TO PRODUCTION -- never amend that file; this is a separate,
-- additive migration, same convention that file itself already
-- established relative to `20260824090000_create_notification_rules.sql`).
--
-- Extends every existing audience-selecting surface with two independent,
-- additive dimensions:
--
--  1. A THIRD targeting mode, `'groups'` -- alongside `'all_eligible'`/
--     `'selected'` (system rules) and `'person'`/`'people'`/`'everyone'`
--     (custom weekly rules, manual broadcasts, scheduled broadcasts).
--     `*_audience_group_keys` / `audience_group_keys` columns store the
--     manager's selected dynamic group keys (see
--     `lib/domain/audienceGroups.ts`'s `AudienceGroupKey` -- service-type
--     קבע/סדיר/מילואים plus role-based אחמ״שים/טכנאים). Membership is
--     ALWAYS resolved fresh against the current roster at the point each
--     surface already resolves its own audience (immediately for a manual
--     send; at save/edit time for a scheduled broadcast, exactly like
--     `'everyone'` already is; fresh on EVERY occurrence dispatch for a
--     custom weekly rule, exactly like `'everyone'` already is there too;
--     fresh on every reminder-worker tick for a system rule) -- this
--     migration adds no new frozen-recipient-snapshot column anywhere,
--     only frozen INTENT (the selected keys themselves).
--
--  2. `*_excluded_person_ids` / `excluded_person_ids` columns -- "לא לשלוח
--     ל", an explicit exclusion list that always applies ON TOP of
--     whichever mode/audience_kind selected the base audience, on every
--     surface, unconditionally. Explicit exclusions always win: a person
--     named here is removed from the result no matter how many groups
--     they belong to, whether they were also selected directly, or
--     whether the base mode is "everyone"/"all_eligible".
--
-- All new columns default to values that reproduce CURRENT production
-- behavior exactly (empty arrays) -- merely applying this migration
-- changes zero outgoing notifications. System rules keep their existing
-- FILTER-ONLY guarantee: `system_audience_mode`/`system_audience_group_keys`/
-- `system_excluded_person_ids` can only ever NARROW a rule's own
-- domain-eligible recipients (see `isSystemRulePersonAllowed`,
-- `lib/domain/audienceSelection.ts`), never expand it -- in particular,
-- permanent (קבע) staff remain structurally excluded from the weekly
-- constraints reminders' own candidate set
-- (`resolveNonPermanentConstraintsRecipients`) regardless of any audience
-- configuration here, since that candidate set is computed BEFORE this
-- filter is ever consulted.
-- ---------------------------------------------------------------------

-- -----------------------------------------------------------------------
-- notification_rules -- system-rule-only group/exclusion columns, plus
-- the SAME two columns for a custom_weekly row's own audience (mirroring
-- `target_person_ids`'s existing shape: 'people'/'groups' selection
-- intent stored for display/re-edit, the already-resolved snapshot living
-- in `target_person_ids` as before).
-- -----------------------------------------------------------------------
alter table public.notification_rules
  add column if not exists system_audience_group_keys text[] not null default '{}',
  add column if not exists system_excluded_person_ids text[] not null default '{}',
  add column if not exists audience_group_keys text[] not null default '{}',
  add column if not exists excluded_person_ids text[] not null default '{}';

comment on column public.notification_rules.system_audience_group_keys is
  'System rule only. Meaningful only when system_audience_mode = ''groups''. Dynamic group keys (see lib/domain/audienceGroups.ts AudienceGroupKey) resolved fresh against the current roster on every reminder-worker tick -- never a frozen id list.';
comment on column public.notification_rules.system_excluded_person_ids is
  'System rule only. "לא לשלוח ל" -- stable roster person ids ALWAYS excluded from this rule, independent of system_audience_mode. Re-validated against the current roster at save time (ruleActions.ts) and applied at send time (isSystemRulePersonAllowed) -- always wins over any other selection.';
comment on column public.notification_rules.audience_group_keys is
  'custom_weekly only. Meaningful only when audience_kind = ''groups''. Display/re-edit intent -- target_person_ids (frozen at save/edit time, re-resolved fresh on every occurrence dispatch by the application layer) is what dispatch actually uses.';
comment on column public.notification_rules.excluded_person_ids is
  'custom_weekly only. "לא לשלוח ל" intent -- already baked into target_person_ids at save/edit time, and re-applied fresh on every occurrence dispatch by the application layer (recurringRuleDispatch.ts).';

alter table public.notification_rules
  drop constraint notification_rules_system_audience_mode_check;
alter table public.notification_rules
  add constraint notification_rules_system_audience_mode_check
  check (system_audience_mode in ('all_eligible', 'selected', 'groups'));

alter table public.notification_rules
  drop constraint notification_rules_audience_kind_check;
alter table public.notification_rules
  add constraint notification_rules_audience_kind_check
  check (audience_kind is null or audience_kind in ('person', 'people', 'everyone', 'groups'));

-- Widen the shape guarantee once more (originally added by the PR #93
-- migration, widened by the copy/audience-filtering migration, widened
-- here again rather than editing either already-applied file) so the
-- four new columns stay correctly scoped between the two row kinds.
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
    and audience_group_keys = '{}'
    and excluded_person_ids = '{}'
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
    and system_audience_group_keys = '{}'
    and system_excluded_person_ids = '{}'
  )
);

-- -----------------------------------------------------------------------
-- manager_notification_batches -- audit record for a manual (immediate or
-- dispatched-scheduled/recurring) broadcast's audience INTENT, alongside
-- its existing frozen `target_person_ids`/`resolved_recipient_user_ids`.
-- -----------------------------------------------------------------------
alter table public.manager_notification_batches
  add column if not exists audience_group_keys text[] not null default '{}',
  add column if not exists excluded_person_ids text[] not null default '{}';

comment on column public.manager_notification_batches.audience_group_keys is
  'The manager''s selected dynamic group keys when audience_kind = ''groups'' -- audit/display only; target_person_ids is the resolved snapshot this batch''s jobs were actually created from.';
comment on column public.manager_notification_batches.excluded_person_ids is
  '"לא לשלוח ל" -- audit/display only; already baked into target_person_ids/resolved_recipient_user_ids by the time this batch exists.';

alter table public.manager_notification_batches
  drop constraint manager_notification_batches_audience_kind_check;
alter table public.manager_notification_batches
  add constraint manager_notification_batches_audience_kind_check
  check (audience_kind in ('person', 'people', 'everyone', 'groups'));

-- -----------------------------------------------------------------------
-- manager_scheduled_broadcasts -- same two intent columns, alongside the
-- existing frozen `target_person_ids` snapshot (re-resolved, including
-- for `'groups'`, on every explicit save/edit -- see this table's own
-- top-of-file doc comment for why "everyone"/"groups" are frozen
-- snapshots here, unlike a custom_weekly rule's own per-occurrence
-- resolution).
-- -----------------------------------------------------------------------
alter table public.manager_scheduled_broadcasts
  add column if not exists audience_group_keys text[] not null default '{}',
  add column if not exists excluded_person_ids text[] not null default '{}';

comment on column public.manager_scheduled_broadcasts.audience_group_keys is
  'The manager''s selected dynamic group keys when audience_kind = ''groups'' -- display/re-edit intent; target_person_ids is the resolved snapshot frozen at save/edit time (re-expanded on every explicit edit, never re-expanded again at dispatch, exactly like "everyone").';
comment on column public.manager_scheduled_broadcasts.excluded_person_ids is
  '"לא לשלוח ל" intent -- already baked into the frozen target_person_ids snapshot at save/edit time.';

alter table public.manager_scheduled_broadcasts
  drop constraint manager_scheduled_broadcasts_audience_kind_check;
alter table public.manager_scheduled_broadcasts
  add constraint manager_scheduled_broadcasts_audience_kind_check
  check (audience_kind in ('person', 'people', 'everyone', 'groups'));

-- -----------------------------------------------------------------------
-- notification_rule_occurrences -- adds `frozen_audience_group_keys`/
-- `frozen_excluded_person_ids` alongside the existing
-- `frozen_audience_kind`/`frozen_target_person_ids`, captured at the SAME
-- fresh-claim instant and never re-read afterward, exactly like every
-- other `frozen_*` column. UNLIKE `frozen_target_person_ids`, these two
-- are re-consulted by the application layer on EVERY occurrence dispatch
-- (never just once) to resolve `'everyone'`/`'groups'` membership fresh
-- against the roster at that dispatch instant, and to apply exclusions --
-- see `recurringRuleDispatch.ts`'s `resolveRecurringDispatchTargets` for
-- the full reasoning (custom weekly rules deliberately do NOT copy a
-- one-time scheduled broadcast's frozen-snapshot semantics for
-- `'everyone'`, and `'groups'`/exclusions follow the exact same pattern
-- for consistency and to satisfy "groups dynamically reflect roster
-- changes at send time").
-- -----------------------------------------------------------------------
alter table public.notification_rule_occurrences
  add column if not exists frozen_audience_group_keys text[] not null default '{}',
  add column if not exists frozen_excluded_person_ids text[] not null default '{}';

alter table public.notification_rule_occurrences
  drop constraint notification_rule_occurrences_audience_kind_check;
alter table public.notification_rule_occurrences
  add constraint notification_rule_occurrences_audience_kind_check
  check (frozen_audience_kind in ('person', 'people', 'everyone', 'groups'));

-- -----------------------------------------------------------------------
-- update_system_rule_configuration_and_invalidate_pending_jobs_v2 --
-- superseding `update_system_rule_configuration_and_invalidate_pending_jobs`
-- (the copy/audience-filtering migration's own RPC) for every EDIT the
-- new app performs, now additionally covering `audience_group_keys`/
-- `excluded_person_ids`. That predecessor RPC is DELIBERATELY LEFT IN
-- PLACE, unmodified -- same rollout-safety reasoning its own doc comment
-- already gives for why IT, in turn, left `update_system_rule_and_
-- invalidate_pending_jobs` (PR #93) alone: an already-deployed OLD app
-- instance must keep working during the window between this migration
-- landing in production and the new app build actually deploying. The
-- new app's `updateSystemRule` (store.ts) calls ONLY this `_v2` function
-- from here on.
--
-- Identical atomicity/optimistic-concurrency/hard-delete-pending-jobs
-- semantics to its predecessor (see that RPC's own extensive doc comment,
-- unchanged here) -- the only difference is two additional columns in the
-- SET list and two additional parameters.
-- -----------------------------------------------------------------------
create or replace function public.update_system_rule_configuration_and_invalidate_pending_jobs_v2(
  p_rule_id uuid,
  p_expected_revision bigint,
  p_enabled boolean,
  p_local_hour smallint,
  p_local_minute smallint,
  p_title_override text,
  p_body_override text,
  p_audience_mode text,
  p_target_person_ids text[],
  p_audience_group_keys text[],
  p_excluded_person_ids text[],
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
        system_audience_group_keys = coalesce(p_audience_group_keys, '{}'),
        system_excluded_person_ids = coalesce(p_excluded_person_ids, '{}'),
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

revoke all on function public.update_system_rule_configuration_and_invalidate_pending_jobs_v2(
  uuid, bigint, boolean, smallint, smallint, text, text, text, text[], text[], text[], text, text
) from public, anon, authenticated;
grant execute on function public.update_system_rule_configuration_and_invalidate_pending_jobs_v2(
  uuid, bigint, boolean, smallint, smallint, text, text, text, text[], text[], text[], text, text
) to service_role;

-- -----------------------------------------------------------------------
-- claim_notification_rule_occurrence_v2 -- superseding
-- `claim_notification_rule_occurrence` for every claim the new app
-- performs. A brand-new function (never `create or replace` on the
-- original name) because its RETURNS TABLE shape changed (two additional
-- output columns) -- Postgres cannot widen an existing function's return
-- shape via `create or replace`, and even if it could, the SAME
-- rollout-safety reasoning applies: the predecessor remains defined,
-- untouched, for an already-deployed old app instance mid-rollout.
--
-- Identical at-most-once claim / disable-edit-archive-before-claim /
-- frozen-content-on-resume semantics to its predecessor (see that RPC's
-- own extensive doc comment in `20260824090000_create_notification_rules.sql`,
-- unchanged here) -- the only difference is freezing (on a fresh claim)
-- and returning (on both a fresh claim and a resume) the rule's CURRENT
-- `audience_group_keys`/`excluded_person_ids` alongside its existing
-- `audience_kind`/`target_person_ids`. The application layer
-- (`recurringRuleDispatch.ts`) re-resolves `'everyone'`/`'groups'`
-- membership and applies exclusions fresh on EVERY dispatch of an
-- occurrence (not just once at claim time) -- this RPC's job is only to
-- freeze the manager's own SELECTION (which groups, which exclusions),
-- exactly like it already freezes `target_person_ids` for `'person'`/
-- `'people'`.
-- -----------------------------------------------------------------------
create or replace function public.claim_notification_rule_occurrence_v2(
  p_rule_id uuid,
  p_occurrence_date date,
  p_lease_seconds integer default 90
)
returns table (
  occurrence_id uuid,
  batch_id uuid,
  is_resume boolean,
  rule_title text,
  rule_body text,
  rule_audience_kind text,
  rule_target_person_ids text[],
  rule_audience_group_keys text[],
  rule_excluded_person_ids text[],
  created_by_person_id text,
  created_by_person_name text
)
language plpgsql
as $$
declare
  existing_row public.notification_rule_occurrences;
  rule_row public.notification_rules;
  inserted_row public.notification_rule_occurrences;
  due_instant timestamptz;
begin
  select * into existing_row from public.notification_rule_occurrences
    where rule_id = p_rule_id and occurrence_date = p_occurrence_date
    for update;

  if found then
    if existing_row.status = 'completed' then
      return; -- genuinely done -- zero rows
    end if;

    if existing_row.claimed_at >= now() - make_interval(secs => p_lease_seconds) then
      return; -- actively leased by another worker right now -- zero rows
    end if;

    -- Stale claim -- resume UNCONDITIONALLY, using the occurrence's OWN
    -- frozen snapshot (see the predecessor RPC's own doc comment for why
    -- both the rule's current state AND its current content are
    -- deliberately irrelevant here).
    update public.notification_rule_occurrences
      set claimed_at = now(), updated_at = now()
      where id = existing_row.id;

    return query
      select existing_row.id, existing_row.batch_id, true,
             existing_row.frozen_title, existing_row.frozen_body,
             existing_row.frozen_audience_kind, existing_row.frozen_target_person_ids,
             existing_row.frozen_audience_group_keys, existing_row.frozen_excluded_person_ids,
             existing_row.frozen_created_by_person_id, existing_row.frozen_created_by_person_name;
    return;
  end if;

  -- Fresh claim -- lock the rule row FIRST so a concurrent disable/edit/
  -- archive (which updates this same row) cannot interleave: see the
  -- predecessor RPC's own doc comment.
  select * into rule_row from public.notification_rules where id = p_rule_id for update;

  if not found
     or rule_row.kind is distinct from 'custom_weekly'
     or rule_row.enabled is not true
     or rule_row.archived_at is not null
  then
    return; -- disabled/archived/missing RIGHT NOW -- never claim, zero rows
  end if;

  -- Re-validate the CURRENT schedule against the locked row -- a stale
  -- in-memory candidate (computed before a weekday/time edit landed)
  -- must never claim under the OLD schedule.
  if extract(dow from p_occurrence_date)::smallint is distinct from rule_row.weekday then
    return; -- this date is no longer this rule's configured weekday -- zero rows
  end if;

  due_instant := (p_occurrence_date::timestamp + make_interval(hours => rule_row.local_hour, mins => rule_row.local_minute))
    at time zone 'Asia/Jerusalem';
  if now() < due_instant then
    return; -- the CURRENT configured time hasn't been reached yet -- zero rows
  end if;

  insert into public.notification_rule_occurrences (
    rule_id, occurrence_date, status, claimed_at,
    frozen_title, frozen_body, frozen_audience_kind, frozen_target_person_ids,
    frozen_audience_group_keys, frozen_excluded_person_ids,
    frozen_created_by_person_id, frozen_created_by_person_name
  )
  values (
    p_rule_id, p_occurrence_date, 'claimed', now(),
    rule_row.title, rule_row.body, rule_row.audience_kind, rule_row.target_person_ids,
    rule_row.audience_group_keys, rule_row.excluded_person_ids,
    rule_row.created_by_person_id, rule_row.created_by_person_name
  )
  on conflict (rule_id, occurrence_date) do nothing
  returning * into inserted_row;

  if inserted_row.id is null then
    return; -- lost a race to a concurrent fresh claim -- zero rows, safe
  end if;

  return query
    select inserted_row.id, inserted_row.batch_id, false,
           inserted_row.frozen_title, inserted_row.frozen_body,
           inserted_row.frozen_audience_kind, inserted_row.frozen_target_person_ids,
           inserted_row.frozen_audience_group_keys, inserted_row.frozen_excluded_person_ids,
           inserted_row.frozen_created_by_person_id, inserted_row.frozen_created_by_person_name;
end;
$$;

revoke all on function public.claim_notification_rule_occurrence_v2(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_rule_occurrence_v2(uuid, date, integer) to service_role;
