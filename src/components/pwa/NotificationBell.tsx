"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, BellOff, BellRing, Loader2, RefreshCw, Settings } from "lucide-react";
import type { NotificationInboxItem } from "@/lib/readModels/notificationInboxTypes";
import { formatRecentChangeRelativeTime } from "@/lib/presentation/relativeChangeTime";
import { usePushSubscription } from "./usePushSubscription";
import { useNotificationInbox } from "./useNotificationInbox";

interface NotificationBellProps {
  /** Only affects the trigger button's own visual treatment -- the popover panel's CONTENT looks identical in every context; only its anchor side (see `PANEL_POSITION_CLASSES`) varies by variant. */
  variant: "sidebar" | "mobile" | "shell";
  /**
   * Authenticated Supabase user id, passed straight through to
   * `usePushSubscription` to key the per-user/per-device Push preference
   * -- see that hook's own docstring. `undefined` only on the (never
   * actually reached in real usage) no-`person` shell render path.
   */
  userId?: string;
}

type BellView = "inbox" | "settings";

const TRIGGER_CLASSES: Record<NotificationBellProps["variant"], string> = {
  sidebar:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
  mobile:
    "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
  /**
   * The global `ShellUtilityBar` top bar (header polish pass) -- same
   * light-surface treatment as `mobile` (this bar sits on the ordinary
   * theme background, never the dark sidebar), but the `rounded-full`
   * circle shape `sidebar` already established. Release-polish pass: sized
   * up from `sidebar`'s 32px to 40px (see `ICON_SIZE_CLASSES` below for the
   * matching icon bump) -- next to the bar's other elements (the two org
   * logos at 64px/49px, the clock pill), the original 32px bell read as
   * visually undersized/out of balance.
   */
  shell:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
};

/** Trigger icon size per variant -- `shell` alone grows alongside its own bigger trigger circle above; `sidebar`/`mobile` are unchanged. */
const ICON_SIZE_CLASSES: Record<NotificationBellProps["variant"], string> = {
  sidebar: "h-[16px] w-[16px]",
  mobile: "h-[16px] w-[16px]",
  shell: "h-[20px] w-[20px]",
};

/**
 * The popover's anchor side, as a LOGICAL `inset-inline-*` side -- under
 * `dir="rtl"`, `inset-inline-end` maps to physical `left` (pins the panel's
 * LEFT edge, growing further RIGHT/inward from there) and
 * `inset-inline-start` maps to physical `right` (pins the RIGHT edge,
 * growing further LEFT/outward). `sidebar`/`mobile` use `end-0` -- their
 * trigger never sits at the true physical left edge, so growing rightward
 * from a pinned left edge stays safely inside the viewport. `shell` sits
 * at the header's own physical LEFT edge (header polish pass): it also
 * needs `end-0` (pin left, grow right/inward) for the same reason -- an
 * earlier version of this used `start-0` here on the (incorrect) belief
 * that it would grow back into the bar; verified in a real browser that it
 * actually did the opposite (grew further left, off-screen, clipping the
 * panel entirely). Kept as its own map (rather than collapsing to one
 * constant) so a future variant anchored elsewhere can still differ.
 */
const PANEL_POSITION_CLASSES: Record<NotificationBellProps["variant"], string> = {
  sidebar: "end-0",
  mobile: "end-0",
  shell: "end-0",
};

/** 9+ reads as "9+", never a wrapping/overflowing three-digit badge. */
function formatBadgeCount(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/**
 * The bell's primary surface (notification-center PR): the user's real
 * Mi-Ma-Mo inbox (`useNotificationInbox`, reusing the existing
 * `notification_jobs` outbox -- never a second notification-rule engine),
 * newest first. Push controls (`usePushSubscription`, unchanged) moved
 * BEHIND the gear icon in the header -- push is one delivery channel
 * among possibly none, never a precondition for the inbox itself, and
 * `sendTestNotificationAction` (reached from there) stays diagnostic-only:
 * it never creates an inbox item, since it never touches
 * `notification_jobs` at all.
 *
 * Originally replacing the "בקרוב" placeholder bell from PR #28 in both
 * `Sidebar` (desktop) and `MobileIdentityBar` (mobile); the desktop
 * instance later moved into `ShellUtilityBar` (`variant="shell"`).
 * Same click-outside/Escape-to-dismiss pattern `MobileProfileMenu`
 * already uses.
 */
export function NotificationBell({ variant, userId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<BellView>("inbox");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const { state, errorMessage, testStatus, enable, disable, sendTest } = usePushSubscription(userId);
  const { status: inboxStatus, items, unreadCount, refresh, markRead, markAllRead, clear } = useNotificationInbox();

  function closePopover() {
    setOpen(false);
    setView("inbox");
  }

  useEffect(() => {
    if (!open) return;
    // A fresh read every time the popover opens (not just once on mount)
    // -- other activity may have created new notifications since the last
    // open. No polling while closed/open: matches this app's existing
    // "no automatic polling for new data" convention (`DataFreshnessStatus`).
    refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closePopover();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePopover();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const isPushEnabled = state === "enabled" || state === "disabling";
  const TriggerIcon = isPushEnabled ? BellRing : Bell;

  function handleItemClick(item: NotificationInboxItem) {
    if (!item.isRead) markRead(item.id);
    closePopover();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unreadCount > 0 ? `התראות, ${unreadCount} שלא נקראו` : "התראות"}
        onClick={() => setOpen((prev) => !prev)}
        className={`relative ${TRIGGER_CLASSES[variant]}`}
      >
        <TriggerIcon className={ICON_SIZE_CLASSES[variant]} aria-hidden="true" strokeWidth={1.75} />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 end-[-2px] flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold leading-none text-critical-foreground"
          >
            {formatBadgeCount(unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={view === "settings" ? "הגדרות התראות" : "התראות"}
          className={`absolute ${PANEL_POSITION_CLASSES[variant]} top-full z-50 mt-2 w-80 max-w-[calc(100vw-2.5rem)] rounded-xl bg-surface-1 p-3 text-foreground shadow-[var(--shadow-elevated)] ring-1 ring-border-strong`}
        >
          {view === "inbox" ? (
            <InboxView
              status={inboxStatus}
              items={items}
              unreadCount={unreadCount}
              onOpenSettings={() => setView("settings")}
              onItemClick={handleItemClick}
              onMarkAllRead={markAllRead}
              onClear={clear}
            />
          ) : (
            <SettingsView
              onBack={() => setView("inbox")}
              state={state}
              errorMessage={errorMessage}
              testStatus={testStatus}
              onEnable={enable}
              onDisable={disable}
              onSendTest={sendTest}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox view
// ---------------------------------------------------------------------------

function InboxView({
  status,
  items,
  unreadCount,
  onOpenSettings,
  onItemClick,
  onMarkAllRead,
  onClear,
}: {
  status: "loading" | "ready" | "error";
  items: NotificationInboxItem[];
  unreadCount: number;
  onOpenSettings: () => void;
  onItemClick: (item: NotificationInboxItem) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-sm font-semibold text-foreground">התראות</p>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="הגדרות התראות"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Settings className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      {status === "loading" ? (
        <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} />
          טוען התראות...
        </div>
      ) : null}

      {status === "error" ? (
        <p className="px-1 py-6 text-center text-sm text-muted">לא ניתן לטעון כרגע את ההתראות</p>
      ) : null}

      {status === "ready" && items.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-muted">אין התראות חדשות</p>
      ) : null}

      {status === "ready" && items.length > 0 ? (
        <>
          <div className="mt-2 flex items-center justify-between gap-2 px-1 text-xs">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
              className="font-medium text-primary transition-colors duration-150 hover:underline disabled:cursor-not-allowed disabled:text-muted-2 disabled:no-underline"
            >
              סמן הכל כנקרא
            </button>
            <button
              type="button"
              onClick={onClear}
              className="font-medium text-muted transition-colors duration-150 hover:text-critical"
            >
              נקה התראות
            </button>
          </div>
          <ul className="mt-1 max-h-96 overflow-y-auto">
            {items.map((item) => (
              <InboxItemRow key={item.id} item={item} onClick={onItemClick} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function InboxItemRow({ item, onClick }: { item: NotificationInboxItem; onClick: (item: NotificationInboxItem) => void }) {
  return (
    <li>
      <Link
        href={item.path}
        onClick={() => onClick(item)}
        className="flex items-start gap-2.5 rounded-xl px-1.5 py-2 transition-colors duration-200 hover:bg-overlay-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span
          aria-hidden="true"
          className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-primary"}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${item.isRead ? "text-muted" : "font-medium text-foreground"}`}>{item.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.body}</p>
          <p className="mt-0.5 text-[11px] text-muted-2">{formatRecentChangeRelativeTime(item.happenedAt, new Date())}</p>
        </div>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Settings view -- the EXISTING push controls (PR #29), unchanged, only
// relocated behind the gear.
// ---------------------------------------------------------------------------

function SettingsView({
  onBack,
  state,
  errorMessage,
  testStatus,
  onEnable,
  onDisable,
  onSendTest,
}: {
  onBack: () => void;
  state: ReturnType<typeof usePushSubscription>["state"];
  errorMessage: string | null;
  testStatus: ReturnType<typeof usePushSubscription>["testStatus"];
  onEnable: () => void;
  onDisable: () => void;
  onSendTest: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה להתראות"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
        </button>
        <p className="text-sm font-semibold text-foreground">הגדרות התראות</p>
      </div>

      <div className="mt-2 px-1">
        {state === "checking" ? <CheckingPanel /> : null}
        {state === "unsupported" ? <UnsupportedPanel /> : null}
        {state === "permission_denied" ? <PermissionDeniedPanel /> : null}
        {state === "not_enabled" || state === "enabling" ? (
          <NotEnabledPanel pending={state === "enabling"} errorMessage={errorMessage} onEnable={onEnable} />
        ) : null}
        {state === "enabled" || state === "disabling" ? (
          <EnabledPanel
            disabling={state === "disabling"}
            testStatus={testStatus}
            onDisable={onDisable}
            onSendTest={onSendTest}
          />
        ) : null}
      </div>
    </div>
  );
}

function CheckingPanel() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} />
      בודק סטטוס התראות...
    </div>
  );
}

function UnsupportedPanel() {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">התראות</p>
      <p className="mt-1 text-xs text-muted">התראות אינן נתמכות בדפדפן או במכשיר הזה.</p>
    </div>
  );
}

function PermissionDeniedPanel() {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">התראות חסומות</p>
      <p className="mt-1 text-xs text-muted">
        ההתראות חסומות בהגדרות הדפדפן או המערכת. כדי להפעיל אותן, יש לאשר התראות עבור האתר בהגדרות ולנסות שוב.
      </p>
    </div>
  );
}

function NotEnabledPanel({
  pending,
  errorMessage,
  onEnable,
}: {
  pending: boolean;
  errorMessage: string | null;
  onEnable: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">סטטוס: כבוי</p>
      <p className="mt-1 text-xs text-muted">קבל תזכורות ועדכונים חשובים ממי-מה-מו</p>
      <button
        type="button"
        onClick={onEnable}
        disabled={pending}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} /> : null}
        {pending ? "מפעיל..." : "הפעל התראות"}
      </button>
      {errorMessage ? <p className="mt-2 text-xs text-critical">{errorMessage}</p> : null}
    </div>
  );
}

function EnabledPanel({
  disabling,
  testStatus,
  onDisable,
  onSendTest,
}: {
  disabling: boolean;
  testStatus: "idle" | "pending" | "success" | "error";
  onDisable: () => void;
  onSendTest: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-primary" aria-hidden="true" strokeWidth={1.75} />
        <p className="text-sm font-semibold text-foreground">סטטוס: פעיל</p>
      </div>

      <button
        type="button"
        onClick={onSendTest}
        disabled={testStatus === "pending" || disabling}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border-strong px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-overlay-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
      >
        {testStatus === "pending" ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" strokeWidth={2} />
        ) : null}
        שלח התראת בדיקה
      </button>
      {testStatus === "success" ? <p className="mt-1.5 text-xs text-success">ההתראה נשלחה בהצלחה.</p> : null}
      {testStatus === "error" ? (
        <p className="mt-1.5 text-xs text-critical">שליחת ההתראה נכשלה. נסו שוב.</p>
      ) : null}

      <button
        type="button"
        onClick={onDisable}
        disabled={disabling}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-critical transition-colors duration-200 hover:bg-critical/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical disabled:cursor-not-allowed disabled:opacity-70"
      >
        {disabling ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} />
        ) : (
          <BellOff className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
        )}
        {disabling ? "מכבה..." : "כבה התראות"}
      </button>
    </div>
  );
}
