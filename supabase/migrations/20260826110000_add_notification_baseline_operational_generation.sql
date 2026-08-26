-- Notification engine: Emergency Mode-aware baseline (spec section 22).
--
-- `notification_baseline_state` already tracks WHICH operational week is
-- the semantic-facts diff base; this adds a second, independent axis --
-- which OPERATIONAL GENERATION (regular, or a specific Emergency Mode
-- SESSION) the last processed tick observed.
--
-- Deliberately a full GENERATION identity, not just a regular/emergency
-- KIND: two separate Emergency Mode activations (period A, later
-- deactivated, then a later unrelated period B) are two different
-- generations of "emergency" truth, even though both share the same
-- `kind`. Without this, a worker tick that last observed period A, then
-- sees period A deactivated and period B activated before its own next
-- tick, would compare "emergency" (A) against "emergency" (B), see no
-- kind change, and diff period B's real desk assignments against period
-- A's stale observed facts -- producing false semantic-change
-- notifications purely from the source/session swap, never a real
-- operational change. Storing the full generation identity instead
-- (`'regular'` or `'emergency:<periodId>'`, the period's own
-- `emergency_mode_periods.id`) makes that swap detectable and gets the
-- SAME silent clear + reseed treatment as any other transition -- so
-- neither entering Emergency Mode, leaving it, NOR swapping from one
-- emergency session to another ever floods every affected person with
-- individual "everything changed" notifications.
--
-- Deliberately a PLAIN column, read/written with ordinary select/update
-- (never routed through the existing `advance_notification_baseline`
-- RPC): that RPC's `select ... for update` lock exists specifically to
-- serialize the WEEK-rollover decision across concurrent worker
-- invocations. A stray double-write of this column has no such hazard --
-- worst case, two concurrent ticks both observe the same generation
-- change and both perform the identical idempotent clear-and-reseed,
-- which is harmless. Extending the existing RPC's signature was
-- deliberately avoided to keep that already-delicate concurrency-critical
-- function untouched.
alter table notification_baseline_state
  add column last_operational_generation text not null default 'regular'
    constraint notification_baseline_state_last_operational_generation_check
      check (
        last_operational_generation = 'regular'
        or last_operational_generation ~ '^emergency:.+$'
      );
