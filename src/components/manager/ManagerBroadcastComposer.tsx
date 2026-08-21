"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import {
  sendManagerBroadcastAction,
  type SendManagerBroadcastActionResult,
} from "@/lib/notifications/manualBroadcastActions";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "@/lib/notifications/manualBroadcastLimits";
import { computeAudienceSummary, unresolvedReasonLabel } from "@/lib/presentation/managerBroadcast";
import { groupRosterHierarchy } from "@/lib/presentation/roster";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

type AudienceKind = "person" | "people" | "everyone";

interface ManagerBroadcastComposerProps {
  roster: ManagerPersonSummary[];
  /** Empty when the "התחברויות והתראות" readiness lookup itself is unavailable -- the picker still works, it just can't annotate anyone's readiness. */
  adoptionPeople: ManagerAdoptionPersonView[];
}

const AUDIENCE_OPTIONS: { value: AudienceKind; label: string }[] = [
  { value: "person", label: "אדם מסוים" },
  { value: "people", label: "כמה אנשים" },
  { value: "everyone", label: "כולם" },
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
};

function errorLabel(error: string): string {
  return ERROR_LABELS[error] ?? "השליחה נכשלה. נסה/י שוב.";
}

function PersonCheckbox({
  person,
  checked,
  onToggle,
  adoption,
}: {
  person: ManagerPersonSummary;
  checked: boolean;
  onToggle: () => void;
  adoption: ManagerAdoptionPersonView | undefined;
}) {
  const reason = adoption ? unresolvedReasonLabel(adoption) : null;

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-overlay-soft">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
      />
      <span className="min-w-0 flex-1 truncate text-foreground">{person.name}</span>
      {adoption?.notificationStatus === "ready" ? (
        <Badge tone="success" className="shrink-0">
          Push
        </Badge>
      ) : adoption?.notificationStatus === "not_enabled" ? (
        <Badge tone="neutral" className="shrink-0">
          התראה בלבד
        </Badge>
      ) : reason ? (
        <Badge tone="warning" className="shrink-0">
          {reason}
        </Badge>
      ) : null}
    </label>
  );
}

/**
 * "📣 שליחת התראה" -- the manager-only manual-broadcast composer. Lives
 * above the adoption/readiness sections in the "התחברויות והתראות"
 * category (see `app/(app)/manager/page.tsx`). Purely a thin client shell
 * around `sendManagerBroadcastAction` -- every real decision (who counts as
 * a valid recipient, push-capable vs. inbox-only vs. unresolved, dedupe)
 * happens server-side; this component's own `computeAudienceSummary` call
 * is an ESTIMATE for the manager to read before sending, never the source
 * of truth (see that function's own docstring).
 */
export function ManagerBroadcastComposer({ roster, adoptionPeople }: ManagerBroadcastComposerProps) {
  const [audienceKind, setAudienceKind] = useState<AudienceKind>("person");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SendManagerBroadcastActionResult | null>(null);

  const adoptionByPersonId = useMemo(
    () => new Map(adoptionPeople.map((person) => [person.personId, person])),
    [adoptionPeople],
  );

  const groups = useMemo(() => groupRosterHierarchy(roster), [roster]);
  const normalizedQuery = query.trim().toLowerCase();

  const effectiveSelectedIds = audienceKind === "everyone" ? roster.map((person) => person.id) : selectedIds;
  const summary = useMemo(
    () => computeAudienceSummary(effectiveSelectedIds, adoptionByPersonId),
    [effectiveSelectedIds, adoptionByPersonId],
  );

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const canSubmit =
    !isPending &&
    trimmedTitle.length > 0 &&
    trimmedTitle.length <= BROADCAST_TITLE_MAX_LENGTH &&
    trimmedBody.length > 0 &&
    trimmedBody.length <= BROADCAST_BODY_MAX_LENGTH &&
    effectiveSelectedIds.length > 0;

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
    startTransition(async () => {
      const outcome = await sendManagerBroadcastAction({
        audienceKind,
        targetPersonIds: audienceKind === "everyone" ? [] : selectedIds,
        title: trimmedTitle,
        body: trimmedBody,
        idempotencyKey,
      });
      setResult(outcome);
      if (outcome.ok) {
        setTitle("");
        setBody("");
        setSelectedIds([]);
        setQuery("");
        setIdempotencyKey(newIdempotencyKey());
      }
    });
  }

  return (
    <Panel variant="panel" data-testid="manager-broadcast-composer">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">📣 שליחת התראה</h3>
          <p className="mt-0.5 text-xs text-muted">
            שולח/ת התראה לתיבת ההתראות של אנשי הצוות שנבחרו, וגם כ-Push למי שהפעיל/ה זאת.
          </p>
        </div>

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
          <div className="rounded-xl bg-overlay-faint p-2 ring-1 ring-border">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש לפי שם"
              aria-label="חיפוש איש/אשת צוות"
              className="mb-1.5 w-full rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-2 focus:outline-none"
            />
            <ul className="max-h-56 overflow-y-auto">
              {groups.map((group) => {
                const rows =
                  group.subgroups.length > 0
                    ? group.subgroups.flatMap((subgroup) => subgroup.people)
                    : group.people;
                const matching = rows.filter(
                  (person) => normalizedQuery === "" || person.name.toLowerCase().includes(normalizedQuery),
                );
                if (matching.length === 0) return null;
                return (
                  <li key={group.group}>
                    <div className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted-2 first:pt-0">
                      {group.label}
                    </div>
                    {matching.map((person) => (
                      <PersonCheckbox
                        key={person.id}
                        person={person}
                        checked={selectedIds.includes(person.id)}
                        onToggle={() => togglePerson(person.id)}
                        adoption={adoptionByPersonId.get(person.id)}
                      />
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
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
        </div>

        <div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-busy={isPending}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "שולח/ת…" : "שלח התראה"}
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
                {result.unresolved.length > 0 ? <li>{result.unresolved.length} מהבחירה לא ניתנים לשליחה</li> : null}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl bg-critical/10 p-3 text-sm text-critical ring-1 ring-critical/25">
              {errorLabel(result.error)}
            </div>
          )
        ) : null}
      </div>
    </Panel>
  );
}
