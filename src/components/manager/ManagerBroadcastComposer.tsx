"use client";

import { useMemo, useState, useTransition } from "react";
import { Panel } from "@/components/ui/Panel";
import { RosterPersonPicker } from "./RosterPersonPicker";
import {
  sendManagerBroadcastAction,
  type SendManagerBroadcastActionResult,
} from "@/lib/notifications/manualBroadcastActions";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "@/lib/notifications/manualBroadcastLimits";
import {
  createScheduledBroadcastAction,
  editScheduledBroadcastAction,
  type ScheduledBroadcastActionResult,
  type ScheduledBroadcastView,
} from "@/lib/notifications/scheduledBroadcastActions";
import { formatScheduledBroadcastMoment } from "@/lib/presentation/scheduledBroadcast";
import { computeAudienceSummary } from "@/lib/presentation/managerBroadcast";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

type AudienceKind = "person" | "people" | "everyone";
type SendMode = "now" | "schedule";

interface ManagerBroadcastComposerProps {
  roster: ManagerPersonSummary[];
  /** Empty when the "התחברויות והתראות" readiness lookup itself is unavailable -- the picker still works, it just can't annotate anyone's readiness. */
  adoptionPeople: ManagerAdoptionPersonView[];
  /** Set while the manager is editing an existing scheduled broadcast (from "🕒 התראות מתוזמנות"'s own "עריכה" action) -- pre-fills the form and switches submission to `editScheduledBroadcastAction`. `null`/omitted is the ordinary "new broadcast" composer. */
  editingItem?: ScheduledBroadcastView | null;
  /** Fired after ANY successful send/save (immediate, scheduled create, or scheduled edit) -- the parent uses this to refresh the scheduled/recent lists. */
  onSaved?: () => void;
  /** Fired when the manager leaves edit mode (save succeeded, or they cancel editing explicitly). */
  onCancelEdit?: () => void;
}

const AUDIENCE_OPTIONS: { value: AudienceKind; label: string }[] = [
  { value: "person", label: "אדם מסוים" },
  { value: "people", label: "כמה אנשים" },
  { value: "everyone", label: "כולם" },
];

const SEND_MODE_OPTIONS: { value: SendMode; label: string }[] = [
  { value: "now", label: "עכשיו" },
  { value: "schedule", label: "תזמון" },
];

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const ERROR_LABELS: Record<string, string> = {
  invalid_request: "הבקשה אינה תקינה. נסה/י שוב.",
  unauthenticated: "יש להתחבר מחדש כדי לשלוח התראה.",
  missing_email: "לא נמצא מייל משויך למשתמש/ת שלך.",
  unmapped: "המשתמש/ת שלך אינו/ה מזוהה/ת בכ״א.",
  ambiguous_identity: "המייל שלך משויך ליותר מרשומה אחת בכ״א.",
  configuration_error: "יש בעיית תצורה במערכת. נסה/י שוב מאוחר יותר.",
  forbidden: "רק מנהל/ת יכול/ה לשלוח התראה.",
  invalid_title: `כותרת ההתראה חייבת להיות בין 1 ל-${BROADCAST_TITLE_MAX_LENGTH} תווים.`,
  invalid_body: `תוכן ההתראה חייב להיות בין 1 ל-${BROADCAST_BODY_MAX_LENGTH} תווים.`,
  invalid_audience: "בחירת \"אדם מסוים\" דורשת בדיוק איש/אשת צוות אחד/ת.",
  invalid_targets: "הבחירה אינה תקפה יותר. נסה/י לבחור מחדש.",
  no_targets: "לא נבחרו אנשי צוות תקפים לשליחה.",
  idempotency_conflict: "השליחה הקודמת עדיין בעיבוד או שונה מהבקשה הזו. נסה/י שוב.",
  invalid_schedule: "יש לבחור תאריך ושעה תקינים בעתיד.",
  not_found: "התזמון לא נמצא -- ייתכן שכבר בוטל.",
  already_started: "השליחה כבר התחילה, ולא ניתן עוד לערוך/לבטל.",
  already_cancelled: "התזמון הזה כבר בוטל.",
};

function errorLabel(error: string): string {
  return ERROR_LABELS[error] ?? "השליחה נכשלה. נסה/י שוב.";
}

function minuteOfDayToTimeValue(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** `null` when `timeValue` isn't a well-formed `HH:MM` (an empty/partially-filled `<input type="time">`). */
function parseTimeValue(timeValue: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * "📣 שליחת התראה" -- the manager-only manual-broadcast composer. Lives
 * above the adoption/readiness sections in the "התחברויות והתראות"
 * category (see `app/(app)/manager/page.tsx`). Purely a thin client shell
 * around `sendManagerBroadcastAction`/`createScheduledBroadcastAction`/
 * `editScheduledBroadcastAction` -- every real decision (who counts as a
 * valid recipient, push-capable vs. inbox-only vs. unresolved, dedupe,
 * audience-snapshot freezing) happens server-side; this component's own
 * `computeAudienceSummary` call is an ESTIMATE for the manager to read
 * before sending/scheduling, never the source of truth (see that
 * function's own docstring).
 *
 * "מתי לשלוח?" (עכשיו / תזמון) branches the SAME form to one of three
 * server actions: an immediate send is byte-for-byte the PR #78 behavior
 * (`sendManagerBroadcastAction`, unchanged); "תזמון" saves a still-mutable
 * scheduled broadcast instead of sending anything (`createScheduledBroadcastAction`)
 * -- never claims Push was sent. `editingItem` repurposes the exact same
 * form to edit an existing scheduled broadcast in place
 * (`editScheduledBroadcastAction`) rather than a second editor UI.
 */
export function ManagerBroadcastComposer({
  roster,
  adoptionPeople,
  editingItem = null,
  onSaved,
  onCancelEdit,
}: ManagerBroadcastComposerProps) {
  // Initial state is derived from `editingItem` once, on mount -- the
  // parent (`ManagerBroadcastArea`) remounts this component with a fresh
  // `key` whenever `editingItem` changes identity (a different scheduled
  // broadcast, or leaving/entering edit mode), so there is no need to
  // re-sync these via an effect.
  const [audienceKind, setAudienceKind] = useState<AudienceKind>(() =>
    editingItem && editingItem.audienceKind !== "everyone" ? editingItem.audienceKind : editingItem ? "everyone" : "person",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    editingItem && editingItem.audienceKind !== "everyone" ? editingItem.targetPersonIds : [],
  );
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState(() => editingItem?.title ?? "");
  const [body, setBody] = useState(() => editingItem?.body ?? "");
  const [sendMode, setSendMode] = useState<SendMode>(() => (editingItem ? "schedule" : "now"));
  const [scheduledDate, setScheduledDate] = useState(() => editingItem?.scheduledLocalDate ?? "");
  const [scheduledTime, setScheduledTime] = useState(() =>
    editingItem ? minuteOfDayToTimeValue(editingItem.scheduledLocalMinuteOfDay) : "",
  );
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SendManagerBroadcastActionResult | null>(null);
  const [scheduleResult, setScheduleResult] = useState<ScheduledBroadcastActionResult | null>(null);

  const adoptionByPersonId = useMemo(
    () => new Map(adoptionPeople.map((person) => [person.personId, person])),
    [adoptionPeople],
  );

  const effectiveSelectedIds = audienceKind === "everyone" ? roster.map((person) => person.id) : selectedIds;
  const summary = useMemo(
    () => computeAudienceSummary(effectiveSelectedIds, adoptionByPersonId),
    [effectiveSelectedIds, adoptionByPersonId],
  );

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const parsedTime = parseTimeValue(scheduledTime);
  const scheduleSummary =
    sendMode === "schedule" && scheduledDate && parsedTime
      ? formatScheduledBroadcastMoment(scheduledDate, parsedTime.hour * 60 + parsedTime.minute)
      : null;

  const canSubmit =
    !isPending &&
    trimmedTitle.length > 0 &&
    trimmedTitle.length <= BROADCAST_TITLE_MAX_LENGTH &&
    trimmedBody.length > 0 &&
    trimmedBody.length <= BROADCAST_BODY_MAX_LENGTH &&
    effectiveSelectedIds.length > 0 &&
    (sendMode === "now" || (scheduledDate.length > 0 && parsedTime !== null));

  function resetForm() {
    setTitle("");
    setBody("");
    setSelectedIds([]);
    setQuery("");
    setScheduledDate("");
    setScheduledTime("");
    setSendMode("now");
    setIdempotencyKey(newIdempotencyKey());
  }

  function toggleAudience(next: AudienceKind) {
    setAudienceKind(next);
    if (next === "person") setSelectedIds((current) => current.slice(0, 1));
  }

  function togglePerson(personId: string) {
    setSelectedIds((current) => {
      if (current.includes(personId)) return current.filter((id) => id !== personId);
      if (audienceKind === "person") return [personId];
      return [...current, personId];
    });
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setResult(null);
    setScheduleResult(null);

    startTransition(async () => {
      if (sendMode === "now" && !editingItem) {
        const outcome = await sendManagerBroadcastAction({
          audienceKind,
          targetPersonIds: audienceKind === "everyone" ? [] : selectedIds,
          title: trimmedTitle,
          body: trimmedBody,
          idempotencyKey,
        });
        setResult(outcome);
        if (outcome.ok) {
          resetForm();
          onSaved?.();
        }
        return;
      }

      if (!parsedTime) return; // canSubmit already guards this; narrows for TypeScript.

      const scheduleInput = {
        audienceKind,
        targetPersonIds: audienceKind === "everyone" ? [] : selectedIds,
        title: trimmedTitle,
        body: trimmedBody,
        scheduledDate,
        scheduledHour: parsedTime.hour,
        scheduledMinute: parsedTime.minute,
      };

      const outcome = editingItem
        ? await editScheduledBroadcastAction(editingItem.id, scheduleInput)
        : await createScheduledBroadcastAction({ ...scheduleInput, idempotencyKey });

      setScheduleResult(outcome);
      if (outcome.ok) {
        resetForm();
        onSaved?.();
        onCancelEdit?.();
      }
    });
  }

  return (
    <Panel variant="panel" data-testid="manager-broadcast-composer">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {editingItem ? "✏️ עריכת התראה מתוזמנת" : "📣 שליחת התראה"}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            שולח/ת התראה לתיבת ההתראות של אנשי הצוות שנבחרו, וגם כ-Push למי שהפעיל/ה זאת.
          </p>
        </div>

        {!editingItem ? (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="מתי לשלוח">
            {SEND_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={sendMode === option.value}
                onClick={() => setSendMode(option.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors duration-150 ${
                  sendMode === option.value
                    ? "bg-primary text-primary-foreground ring-primary"
                    : "bg-overlay-soft text-foreground ring-border hover:bg-overlay-strong"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={onCancelEdit} className="self-start text-xs font-medium text-muted underline">
            ביטול עריכה
          </button>
        )}

        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="למי לשלוח">
          {AUDIENCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={audienceKind === option.value}
              onClick={() => toggleAudience(option.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors duration-150 ${
                audienceKind === option.value
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-overlay-soft text-foreground ring-border hover:bg-overlay-strong"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {audienceKind !== "everyone" ? (
          <RosterPersonPicker
            roster={roster}
            adoptionPeople={adoptionPeople}
            query={query}
            onQueryChange={setQuery}
            selectedIds={selectedIds}
            onTogglePerson={togglePerson}
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">כותרת</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={BROADCAST_TITLE_MAX_LENGTH}
              placeholder="לדוגמה: עדכון חשוב"
              className="rounded-lg bg-overlay-soft px-3 py-1.5 text-sm text-foreground placeholder:text-muted-2 ring-1 ring-border focus:outline-none"
            />
            <span className="text-[11px] text-muted-2">
              {title.length}/{BROADCAST_TITLE_MAX_LENGTH}
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">תוכן ההודעה</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={BROADCAST_BODY_MAX_LENGTH}
              rows={3}
              placeholder="תוכן ההתראה שיוצג לאנשי הצוות"
              className="resize-none rounded-lg bg-overlay-soft px-3 py-1.5 text-sm text-foreground placeholder:text-muted-2 ring-1 ring-border focus:outline-none"
            />
            <span className="text-[11px] text-muted-2">
              {body.length}/{BROADCAST_BODY_MAX_LENGTH}
            </span>
          </label>
        </div>

        {sendMode === "schedule" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">תאריך</span>
              <input
                type="date"
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.target.value)}
                aria-label="תאריך השליחה"
                className="rounded-lg bg-overlay-soft px-3 py-1.5 text-sm text-foreground ring-1 ring-border focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">שעה</span>
              <input
                type="time"
                value={scheduledTime}
                onChange={(event) => setScheduledTime(event.target.value)}
                aria-label="שעת השליחה"
                className="rounded-lg bg-overlay-soft px-3 py-1.5 text-sm text-foreground ring-1 ring-border focus:outline-none"
              />
            </label>
            {scheduleSummary ? (
              <p className="text-xs font-medium text-primary sm:col-span-2">תוזמן ל{scheduleSummary}</p>
            ) : null}
          </div>
        ) : null}

        {trimmedTitle || trimmedBody ? (
          <div className="rounded-xl bg-overlay-faint p-3 ring-1 ring-border">
            <p className="text-[11px] font-medium text-muted-2">תצוגה מקדימה</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{trimmedTitle || "כותרת ההתראה"}</p>
            <p className="text-sm text-muted">{trimmedBody || "תוכן ההתראה"}</p>
          </div>
        ) : null}

        <div className="text-sm text-muted">
          <p>
            נבחרו <span className="font-semibold text-foreground">{summary.selectedCount}</span> אנשי צוות
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            <li>{summary.pushCapableCount} יקבלו גם Push</li>
            <li>{summary.inboxOnlyCount} יקבלו במרכז ההתראות בלבד</li>
            {summary.unresolvedCount > 0 ? (
              <li className="text-warning">{summary.unresolvedCount} לא ניתנים לשליחה כרגע</li>
            ) : null}
          </ul>
          {sendMode === "schedule" ? (
            <p className="mt-1 text-[11px] text-muted-2">
              ההערכה משקפת את המצב הנוכחי בלבד -- היא עשויה להשתנות עד למועד השליחה בפועל.
            </p>
          ) : null}
        </div>

        <div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-busy={isPending}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending
              ? "שולח/ת…"
              : editingItem
                ? "שמירת שינויים"
                : sendMode === "now"
                  ? "שלח התראה"
                  : "שמירת תזמון"}
          </button>
        </div>

        {result ? (
          result.ok ? (
            <div className="rounded-xl bg-success/10 p-3 text-sm text-success ring-1 ring-success/25">
              <p className="font-semibold">
                ✅ נוצרה התראה ל־{result.resolvedRecipientCount} משתמשים
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                <li>{result.pushCapableCount} מיועדים גם ל-Push</li>
                <li>{result.inboxOnlyCount} יקבלו במרכז ההתראות בלבד</li>
                {result.unresolvedCount > 0 ? <li>{result.unresolvedCount} מהבחירה לא ניתנים לשליחה</li> : null}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl bg-critical/10 p-3 text-sm text-critical ring-1 ring-critical/25">
              {errorLabel(result.error)}
            </div>
          )
        ) : null}

        {scheduleResult ? (
          scheduleResult.ok ? (
            <div className="rounded-xl bg-success/10 p-3 text-sm text-success ring-1 ring-success/25">
              <p className="font-semibold">
                ✅ ההתראה תוזמנה
                {formatScheduledBroadcastMoment(
                  scheduleResult.item.scheduledLocalDate,
                  scheduleResult.item.scheduledLocalMinuteOfDay,
                )
                  ? ` ל${formatScheduledBroadcastMoment(
                      scheduleResult.item.scheduledLocalDate,
                      scheduleResult.item.scheduledLocalMinuteOfDay,
                    )}`
                  : ""}
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-critical/10 p-3 text-sm text-critical ring-1 ring-critical/25">
              {errorLabel(scheduleResult.error)}
            </div>
          )
        ) : null}
      </div>
    </Panel>
  );
}
