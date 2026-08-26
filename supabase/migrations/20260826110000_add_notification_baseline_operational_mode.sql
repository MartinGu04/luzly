-- Notification engine: Emergency Mode-aware baseline (spec section 22).
--
-- `notification_baseline_state` already tracks WHICH operational week is
-- the semantic-facts diff base; this adds a second, independent axis --
-- which OPERATIONAL WORLD (regular vs emergency) the last processed tick
-- observed. A worker tick that finds this value has flipped since the
-- last tick treats it exactly like a week rollover (silent clear +
-- reseed of the current week's observed/pending state, never a diff,
-- never a notification) -- so neither entering nor leaving Emergency
-- Mode ever floods every affected person with individual "everything
-- changed" notifications the moment regular change detection resumes.
--
-- Deliberately a PLAIN column, read/written with ordinary select/update
-- (never routed through the existing `advance_notification_baseline`
-- RPC): that RPC's `select ... for update` lock exists specifically to
-- serialize the WEEK-rollover decision across concurrent worker
-- invocations. A stray double-write of this flag has no such hazard --
-- worst case, two concurrent ticks both observe the same mode flip and
-- both perform the identical idempotent clear-and-reseed, which is
-- harmless. Extending the existing RPC's signature was deliberately
-- avoided to keep that already-delicate concurrency-critical function
-- untouched.
alter table notification_baseline_state
  add column last_operational_mode text not null default 'regular'
    constraint notification_baseline_state_last_operational_mode_check
      check (last_operational_mode in ('regular', 'emergency'));
