-- ---------------------------------------------------------------------
-- manager_notification_batches -- a small, dedicated audit + idempotency
-- record for manager-initiated manual broadcast notifications ("שליחת
-- התראה", Manager Area -> התחברויות והתראות). This is deliberately NOT a
-- second notification/delivery engine: per-recipient delivery state stays
-- owned entirely by `notification_jobs`/`notification_deliveries` (one
-- `notification_jobs` row per resolved recipient, category
-- 'manager_broadcast', reusing the exact same worker/inbox pipeline every
-- other notification category already goes through). This table exists
-- only for the two things `notification_jobs` cannot represent on its
-- own: WHO (which manager) initiated a send, and a stable idempotency
-- boundary for the whole batch (so a retried/double-submitted composer
-- click can never create two logical batches, independent of the
-- per-job `dedupe_key` uniqueness that already protects each recipient).
--
-- `created_by_person_id`/`created_by_person_name` identify the SENDING
-- manager only -- never a recipient -- so this row's own identity columns
-- carry no recipient PII (per-recipient delivery/read state lives in
-- `notification_jobs`/`notification_reads`, keyed by `recipient_user_id`
-- alone). `target_person_ids` records the roster ids the manager selected
-- (safe, non-secret roster identifiers, not emails) for audit of the
-- INTENDED audience.
--
-- `resolved_recipient_user_ids` is the batch's own immutability anchor:
-- the EXACT set of Supabase auth user ids this batch resolved to at
-- creation time. Once a batch exists, its logical recipient set is
-- frozen -- a replay (same idempotency_key, same logical request) only
-- ever retries job creation for THESE stored ids, never a freshly
-- re-resolved set. Without this, a roster that grew (or a person whose
-- email/auth mapping newly resolved) between the original send and a
-- retried/duplicate submission could silently add a recipient under the
-- OLD batch id -- see the manual-broadcast engine's own docs for the
-- exact scenario. This is still never a second delivery engine: it is a
-- plain array of ids for idempotent replay, not per-recipient delivery
-- state (that stays entirely `notification_jobs`/`notification_deliveries`'s
-- own).
-- ---------------------------------------------------------------------
create table if not exists public.manager_notification_batches (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  created_by_person_id text not null,
  created_by_person_name text not null,
  audience_kind text not null,
  target_person_ids text[] not null default '{}',
  resolved_recipient_user_ids uuid[] not null default '{}',
  title text not null,
  body text not null,
  resolved_recipient_count integer not null default 0,
  push_capable_count integer not null default 0,
  inbox_only_count integer not null default 0,
  unresolved_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint manager_notification_batches_idempotency_key_unique unique (idempotency_key),
  constraint manager_notification_batches_audience_kind_check
    check (audience_kind in ('person', 'people', 'everyone'))
);

create index if not exists manager_notification_batches_created_at_idx
  on public.manager_notification_batches (created_at desc);

alter table public.manager_notification_batches enable row level security;

-- No RLS policies declared -- same "service-role only, default-deny"
-- convention every other notification-engine table already uses (see
-- `20260815130000_create_notification_engine.sql`'s own comment). Only
-- `getNotificationServiceClient()` ever reads/writes this table.
