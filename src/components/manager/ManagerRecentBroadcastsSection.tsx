"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { getRecentManagerBroadcastsAction, type RecentManagerBroadcastView } from "@/lib/notifications/manualBroadcastActions";

interface ManagerRecentBroadcastsSectionProps {
  /** Bumped by the parent after any dispatch (immediate send, or a scheduled broadcast's "שלח עכשיו"/worker dispatch) so this list stays current. */
  reloadToken: number;
  /**
   * Whether `ManagerScheduledBroadcastsSection` currently reports at least
   * one active item -- this section only polls while that's true (spec
   * §7: "while the communication area has active scheduled broadcasts"),
   * since a background worker dispatch is the only kind of change that
   * could land here WITHOUT this manager's own action already bumping
   * `reloadToken`.
   */
  pollWhileActive: boolean;
}

/** Same ~15-20s cadence as `ManagerScheduledBroadcastsSection`'s own poll (spec §7). */
const POLL_INTERVAL_MS = 17_000;

/** Cards shown by default before "הצג עוד (N)" is needed -- presentation-only, never affects how much the server returns. */
const COMPACT_VISIBLE_COUNT = 3;

/**
 * Namespaced so it can never collide with an unrelated key -- deliberately
 * a single scalar ISO cutoff, not an ever-growing list of hidden ids (see
 * `readClearedBeforeIso`/`writeClearedBeforeIso` below for the exact
 * semantics). Device/browser-local only, V1 -- no backend table/migration
 * to sync this visual preference across devices.
 */
const CLEARED_BEFORE_STORAGE_KEY = "mi-ma-mo:manager-recent-broadcasts:cleared-before";

/**
 * Reads the "נקה מהתצוגה" cutoff, if any. Fails safe on every possible way
 * this can go wrong (no `window`/SSR, storage unavailable -- private mode,
 * quota, disabled -- or a malformed/garbage stored value that doesn't even
 * parse as a date): all of these return `null`, which means "no cutoff,
 * show normal history" -- never a thrown error, never an accidental
 * over-hide from garbage input.
 *
 * Re-canonicalizes a valid stored value through `Date.parse` ->
 * `new Date(ms).toISOString()` before returning it, so downstream
 * comparisons never need to re-derive this -- see this file's own
 * "chronological, not lexicographic" note above `parseCreatedAtMs`.
 */
function readClearedBeforeIso(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLEARED_BEFORE_STORAGE_KEY);
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const parsedMs = Date.parse(raw);
    if (Number.isNaN(parsedMs)) return null;
    return new Date(parsedMs).toISOString();
  } catch {
    return null;
  }
}

/** Best-effort persistence -- a write failure (private mode, quota) must never break the page; the clear still applies to this render via React state, it just won't survive a reload. */
function writeClearedBeforeIso(iso: string): void {
  try {
    window.localStorage.setItem(CLEARED_BEFORE_STORAGE_KEY, iso);
  } catch {
    // Intentionally ignored -- see docstring above.
  }
}

/**
 * CHRONOLOGICAL, not lexicographic. `createdAt` (both from the server and
 * from a stored cutoff) is a valid ISO-8601 timestamp, but two valid ISO
 * timestamps can use different textual representations for the SAME or a
 * differently-ordered instant -- e.g. "2026-08-21T10:00:00+03:00" (07:00Z)
 * sorts AFTER "2026-08-21T08:00:00.000Z" (08:00Z) as plain strings despite
 * being chronologically EARLIER. Every cutoff comparison in this file goes
 * through this parser (epoch milliseconds) rather than `>`/`<` on the raw
 * strings, specifically to avoid that class of bug. Returns `null` for
 * anything that doesn't parse -- callers fail OPEN on that (never hide a
 * row merely because ITS OWN timestamp happens to be malformed; only a
 * malformed STORED CUTOFF fails closed to "no cutoff" -- see
 * `readClearedBeforeIso`).
 */
function parseCreatedAtMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function audienceLabel(item: RecentManagerBroadcastView): string {
  if (item.audienceKind === "everyone") return "כולם";
  return `${item.resolvedRecipientCount} אנשי צוות`;
}

/**
 * "נשלחו לאחרונה" -- reuses PR #78's own `getRecentManagerBroadcastsAction`
 * (a small, bounded read of `manager_notification_batches`, already
 * manager-gated and already tested) rather than building a second
 * history/archive system (spec §6). A scheduled broadcast that has
 * dispatched becomes an ordinary batch row here automatically -- nothing
 * scheduling-specific needs to be added to this query.
 *
 * PR #81 adds purely PRESENTATIONAL cleanup on top of that same bounded
 * server list (still capped at `RECENT_MANAGER_BROADCASTS_LIMIT` = 10,
 * never a second page/fetch):
 * - shows only the latest `COMPACT_VISIBLE_COUNT` by default, with a
 *   "הצג עוד (N)" / "הצג פחות" toggle over whatever is already loaded;
 * - "נקה מהתצוגה" hides everything currently loaded from THIS view,
 *   persisted as a single ISO cutoff in localStorage (`readClearedBeforeIso`/
 *   `writeClearedBeforeIso`) -- visual only, NEVER a write/delete against
 *   `manager_notification_batches` or any other table. A later poll that
 *   returns a genuinely newer batch (`createdAt` after the cutoff)
 *   reappears automatically; anything at or before the cutoff stays
 *   hidden even after a poll re-fetches it.
 */
export function ManagerRecentBroadcastsSection({ reloadToken, pollWhileActive }: ManagerRecentBroadcastsSectionProps) {
  const [items, setItems] = useState<RecentManagerBroadcastView[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Lazy initializer -- `typeof window === "undefined"` during any SSR
  // pass (returns null there), the real stored value on the client's
  // first render. Never a hydration mismatch: `items` is still `null` at
  // that exact same first render regardless (the fetch below only
  // resolves after mount), so this section renders nothing on both the
  // server and the client's first pass no matter what this value is.
  const [clearedBeforeIso, setClearedBeforeIso] = useState<string | null>(() => readClearedBeforeIso());

  // Always loads once on mount / whenever `reloadToken` bumps (a manager's
  // own action elsewhere). The chained setTimeout re-fetch beyond that is
  // gated entirely on `pollWhileActive` -- re-armed after each successful
  // load only while it's still true, so this stops polling the instant
  // `ManagerScheduledBroadcastsSection` reports no active items left
  // (spec §7's "pause when there are no active schedules"). Chaining
  // (never setInterval) keeps overlapping requests structurally
  // impossible, same reasoning as the scheduled section's own poll.
  //
  // A THROWN failure (network hiccup, transient 5xx, ...) is deliberately
  // NOT treated as "stop polling" while `pollWhileActive` is true -- same
  // reasoning as `ManagerScheduledBroadcastsSection`'s own fix: "unknown"
  // is not "empty", so this retries on the next normal interval rather
  // than dying silently until an unrelated `reloadToken`/`pollWhileActive`
  // change happens to resurrect it. Only a typed `result.ok === false`
  // (a genuinely permanent manager-auth state -- see
  // `loadManagerPersonnelContext`'s own docs for why that union can never
  // include a transient `configuration_error`) stops scheduling further
  // polls. Whenever `pollWhileActive` is false, no retry is ever
  // scheduled either way -- this section simply stays quiet until the
  // scheduled section reports active items again.
  //
  // Neither `expanded` nor `clearedBeforeIso` is ever touched by this
  // effect -- a poll can only ever change WHICH raw rows `items` holds,
  // never the manager's own view/clear preferences layered on top.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const result = await getRecentManagerBroadcastsAction();
        if (cancelled) return;
        if (result.ok) {
          setItems(result.items);
          if (pollWhileActive) {
            timeoutId = setTimeout(load, POLL_INTERVAL_MS);
          }
        } else {
          // A typed `result.ok === false` is a genuinely PERMANENT
          // manager-auth state (`forbidden`, `unauthenticated`,
          // `unmapped`, `ambiguous_identity`, `missing_email` -- the
          // only statuses `loadManagerPersonnelContext` can ever
          // return), unlike a thrown failure. Fails closed: any
          // previously-loaded items are cleared rather than left
          // showing stale data the caller may no longer be authorized to
          // see, and no retry is scheduled -- retrying wouldn't change a
          // permanent state anyway.
          setItems(null);
        }
      } catch {
        if (!cancelled) {
          // Deliberately no early return / state wipe here -- `items`
          // (if anything was already loaded) is left completely
          // untouched, so a transient failure never makes an already-
          // visible "נשלחו לאחרונה" list disappear.
          if (pollWhileActive) {
            timeoutId = setTimeout(load, POLL_INTERVAL_MS);
          }
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [reloadToken, pollWhileActive]);

  function handleClear() {
    if (!items || items.length === 0) return;
    // The newest createdAt among what's CURRENTLY LOADED (never the
    // client's own clock -- clock drift must not accidentally hide a
    // genuinely future/just-created broadcast), compared CHRONOLOGICALLY
    // (see `parseCreatedAtMs`'s own docstring) -- never assumes the
    // store's own newest-first ordering, and never assumes every
    // timestamp shares one textual representation.
    const maxMs = items.reduce((max, item) => {
      const ms = parseCreatedAtMs(item.createdAt);
      return ms !== null && ms > max ? ms : max;
    }, Number.NEGATIVE_INFINITY);
    if (!Number.isFinite(maxMs)) return; // every loaded item had an unparseable createdAt -- nothing sane to cut off, fail safe by doing nothing
    const cutoffIso = new Date(maxMs).toISOString();
    writeClearedBeforeIso(cutoffIso);
    setClearedBeforeIso(cutoffIso);
  }

  // A transient background-poll failure must never hide already-loaded
  // items (see the effect's own docstring above) -- there is no error
  // state to gate on here at all, deliberately. `items === null`
  // (nothing has ever loaded successfully yet, including right after an
  // initial failure) and a genuine successful empty result both still
  // render nothing, exactly as before.
  if (items === null) return null;

  // Hide anything at or before the cutoff (spec: `createdAt <= cutoff` is
  // hidden) -- purely a client-side view filter over the same bounded
  // server list, never a second fetch/page. Compared CHRONOLOGICALLY, not
  // as strings (see `parseCreatedAtMs`) -- an item whose OWN `createdAt`
  // fails to parse fails OPEN (stays visible) rather than being silently
  // hidden by a bad comparison.
  const cutoffMs = clearedBeforeIso === null ? null : parseCreatedAtMs(clearedBeforeIso);
  const visibleItems =
    cutoffMs === null
      ? items
      : items.filter((item) => {
          const itemMs = parseCreatedAtMs(item.createdAt);
          return itemMs === null || itemMs > cutoffMs;
        });

  if (visibleItems.length === 0) return null;

  const displayedItems = expanded ? visibleItems : visibleItems.slice(0, COMPACT_VISIBLE_COUNT);
  const remainingCount = visibleItems.length - COMPACT_VISIBLE_COUNT;

  return (
    <Panel variant="compact" data-testid="manager-recent-broadcasts">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">נשלחו לאחרונה</h4>
        <button
          type="button"
          onClick={handleClear}
          title="הסתרה מהתצוגה במכשיר זה בלבד -- ההיסטוריה בשרת לא נמחקת"
          className="rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-border hover:bg-overlay-strong"
        >
          נקה מהתצוגה
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {displayedItems.map((item) => (
          <li key={item.id} className="rounded-lg bg-overlay-faint p-2.5 ring-1 ring-border">
            <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted">
              {audienceLabel(item)} · נשלח ע״י {item.createdByPersonName}
            </p>
          </li>
        ))}
      </ul>
      {!expanded && remainingCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {`הצג עוד (${remainingCount})`}
        </button>
      ) : expanded && visibleItems.length > COMPACT_VISIBLE_COUNT ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          הצג פחות
        </button>
      ) : null}
    </Panel>
  );
}
