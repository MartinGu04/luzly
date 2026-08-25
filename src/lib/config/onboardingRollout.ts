/**
 * Account-level eligibility for the Overview page's "השלמת הגדרה" setup
 * card (nav redesign pass, pre-merge correction). This is deliberately
 * SEPARATE from `SetupSection`'s own per-item completion logic:
 *
 * - THIS module decides WHETHER the card can appear at all for a given
 *   account -- a one-time, permanent classification based purely on the
 *   authoritative Supabase `auth.users.created_at` timestamp
 *   (`AuthIdentityResult.createdAt` / `PersonalScheduleLoadResult.accountCreatedAt`).
 * - `SetupSection` itself still decides WHICH rows show inside an eligible
 *   account's card, from real current device/account state (PWA install
 *   state, Push subscription state, calendar-feed `enabled` flag).
 *
 * Never conflate the two: a veteran account opened on a brand-new browser
 * has no PWA install, no Push subscription, and possibly no calendar sync
 * either -- exactly the same DEVICE-level signals a genuinely new account
 * would show. Device state can only ever prove "this specific browser
 * hasn't finished setup", never "this account is new". Account age is the
 * only thing that can prove the latter, which is why eligibility here
 * never reads `localStorage`, `PwaInstallProvider`, or `usePushSubscription`
 * -- those are exactly the signals this module exists to NOT use for this
 * decision.
 *
 * No I/O, no env vars -- pure configuration/pure functions, safe to import
 * from both server and client code (though in practice only server code
 * ever has `accountCreatedAt` to pass in -- see `(dashboard)/page.tsx`).
 */

/**
 * The onboarding feature's rollout cutoff -- accounts created strictly
 * BEFORE this instant are permanently grandfathered (the setup card never
 * appears for them, regardless of any later change in their device/Push/
 * calendar-sync state); accounts created AT or AFTER it are eligible.
 * Centralized here, as a single documented constant, rather than a raw
 * timestamp scattered across components -- update this one value if the
 * rollout date ever needs to change, never edit call sites.
 *
 * Deliberately NOT set to this PR's authoring date: at authoring time
 * (2026-08-25) this feature had not shipped yet -- the PR was still open,
 * unmerged -- so the exact merge/deploy instant is not knowable in advance.
 * A cutoff equal to (or before) the authoring date would misclassify any
 * account created later that same day, still before the real rollout, as
 * "new"/onboarding-eligible. Set one full day past the authoring date
 * instead, as a safety buffer past any realistic merge time -- every
 * account that already existed before מי-מה-מו ever had a setup card must
 * never suddenly see one just because the feature shipped. The one-sided
 * cost of this buffer is a handful of genuinely-new accounts created in
 * that same narrow window not seeing the card immediately, which is safe
 * (never shown = never wrong) and correctable by moving this value earlier
 * once the real rollout instant is known -- never move it earlier than
 * that actual instant.
 */
export const ONBOARDING_ROLLOUT_CUTOFF = "2026-08-26T00:00:00.000Z";

/**
 * Pure account-level eligibility check. Fails closed on anything that
 * isn't a genuinely parseable timestamp strictly at/after the cutoff --
 * `undefined`/empty/malformed input is never treated as "new", since the
 * whole point of this gate is that the ABSENCE of proof an account is new
 * must default to veteran/hidden, never the other way around.
 */
export function isEligibleForOnboarding(accountCreatedAt: string | null | undefined): boolean {
  if (!accountCreatedAt) return false;
  const createdAtMs = Date.parse(accountCreatedAt);
  if (Number.isNaN(createdAtMs)) return false;
  return createdAtMs >= Date.parse(ONBOARDING_ROLLOUT_CUTOFF);
}
