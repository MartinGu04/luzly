import type {
  ManagerAdoptionDataIssue,
  ManagerAdoptionPersonView,
  ManagerAdoptionState,
  ManagerAdoptionSummary,
} from "@/lib/readModels/managerTypes";

/** The exact roster-data-problem label for each `ManagerAdoptionDataIssue` -- deliberately never "hasn't logged in": these people were never even eligible to be matched, so a manager's fix is in כ"א, not a nudge to the person. */
const DATA_ISSUE_LABEL: Record<ManagerAdoptionDataIssue, string> = {
  missing_email: "חסר מייל בכ״א",
  ambiguous_email: "מייל משויך ליותר מאדם אחד",
};

/** One row in a "התחברויות והתראות" group -- name/photo, plus the specific roster-data problem only when relevant (`dataIssueGroup`; `null` in every other group, whose own heading already says the status). */
export interface AdoptionPersonRowView {
  personId: string;
  personName: string;
  avatarUrl: string | null;
  issueLabel: string | null;
}

/** One labeled bucket of people -- omitted from rendering entirely when empty (same "never render an empty group" convention the old מצב התראות aside used). */
export interface AdoptionGroupView {
  label: string;
  people: AdoptionPersonRowView[];
}

/** One labeled count for the summary strip -- see `ManagerAdoptionSummary` for what each proves. */
export interface AdoptionStatView {
  label: string;
  value: number;
}

/**
 * The whole "התחברויות והתראות" category's view -- unlike the old inline
 * מצב התראות aside (`{kind: "hidden"}` on an all-ready roster), `available`
 * always renders here, even when every count but `totalCount` is zero: this
 * is a full category page a manager navigates to on purpose, not a
 * transient note that should vanish on a calm day.
 * - `hidden` -- the lookup was never attempted (a person is selected; this
 *   category, like every other, only renders in the "everyone" scope) --
 *   kept only for type-safety parity with `ManagerAdoptionState`, never
 *   actually reached by `/manager`'s own rendering.
 * - `unavailable` -- the lookup was attempted and failed; a small neutral
 *   notice, never conflated with "everyone is ready".
 */
export type ManagerAdoptionSectionView =
  | { kind: "hidden" }
  | { kind: "unavailable" }
  | {
      kind: "available";
      headline: string;
      stats: AdoptionStatView[];
      /** "מי עדיין לא נכנס?" -- always actionable: a manager nudge means "go log in". */
      notLoggedInGroup: AdoptionGroupView;
      /** "מי נכנס אבל לא הפעיל התראות?" -- always actionable: a manager nudge means "go enable notifications". */
      notificationsOffGroup: AdoptionGroupView;
      /** "מי מוכן לקבל התראות?" -- quiet by design; the UI collapses this rather than surfacing it with the same weight as the two actionable groups above. */
      readyGroup: AdoptionGroupView;
      /** A כ"א roster problem, not a person to remind -- kept visually and structurally separate from the three groups above. */
      dataIssueGroup: AdoptionGroupView;
    };

function toRow(person: ManagerAdoptionPersonView): AdoptionPersonRowView {
  return {
    personId: person.personId,
    personName: person.personName,
    avatarUrl: person.avatarUrl,
    issueLabel: person.dataIssue ? DATA_ISSUE_LABEL[person.dataIssue] : null,
  };
}

/** "18 מתוך 24 כבר נכנסו למערכת" -- the one sentence a manager reads first; every other number lives in `stats` below it. */
function buildHeadline(summary: ManagerAdoptionSummary): string {
  if (summary.totalCount === 0) return "אין אנשי צוות להצגה.";
  return `${summary.loggedInCount} מתוך ${summary.totalCount} כבר נכנסו למערכת`;
}

/** Every stat here answers a real question from the product spec -- never a decorative count. */
function buildStats(summary: ManagerAdoptionSummary): AdoptionStatView[] {
  return [
    { label: "סה״כ אנשי צוות", value: summary.totalCount },
    { label: "נכנסו למערכת", value: summary.loggedInCount },
    { label: "טרם נכנסו", value: summary.notLoggedInCount },
    { label: "מוכנים לקבל התראות", value: summary.notificationReadyCount },
    { label: "נכנסו, התראות לא פעילות", value: summary.loggedInNotReadyCount },
    { label: "בעיית נתונים בכ״א", value: summary.dataIssueCount },
  ];
}

/**
 * Builds the "התחברויות והתראות" category's entire view from the read
 * model's own three-state `ManagerAdoptionState`. Groups by the SAME
 * `loginStatus`/`notificationStatus`/`dataIssue` split the read model
 * already computed -- this function only labels/buckets/sorts, it never
 * re-derives who is ready or who has an account.
 */
export function buildManagerAdoptionSectionView(state: ManagerAdoptionState): ManagerAdoptionSectionView {
  if (state.status === "skipped") return { kind: "hidden" };
  if (state.status === "unavailable") return { kind: "unavailable" };

  const { people, summary } = state.view;

  return {
    kind: "available",
    headline: buildHeadline(summary),
    stats: buildStats(summary),
    notLoggedInGroup: {
      label: "טרם נכנסו למערכת",
      people: people.filter((p) => p.loginStatus === "not_logged_in").map(toRow),
    },
    notificationsOffGroup: {
      label: "נכנסו למערכת אך לא הפעילו התראות",
      people: people.filter((p) => p.notificationStatus === "not_enabled").map(toRow),
    },
    readyGroup: {
      label: "מוכנים לקבל התראות",
      people: people.filter((p) => p.notificationStatus === "ready").map(toRow),
    },
    dataIssueGroup: {
      label: "בעיית נתונים בכ״א",
      people: people.filter((p) => p.dataIssue !== null).map(toRow),
    },
  };
}
