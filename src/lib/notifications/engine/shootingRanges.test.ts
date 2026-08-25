import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";
import type { RecipientResolution, ResolvedRecipient } from "./recipients";

const resolveNotificationRecipients = vi.fn();
const insertNotificationJobIfAbsent = vi.fn();
const upsertPendingReminderJob = vi.fn();
const cancelPendingReminderJob = vi.fn();

// `filterManagerRecipients` is kept REAL (a pure `Person.isManager` filter
// over an already-resolved map, no I/O of its own) -- only
// `resolveNotificationRecipients` is mocked, since it's the one function
// here that makes a real Supabase Admin API call
// (`fetchAllUserIdsByEmail`). This means "who actually counts as a manager
// recipient" is exercised through the SAME real filtering logic production
// uses, never a mocked pass-through -- a non-manager present in the
// resolved map must still never receive a job.
vi.mock("./recipients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./recipients")>();
  return { ...actual, resolveNotificationRecipients };
});
vi.mock("./store", () => ({ insertNotificationJobIfAbsent, upsertPendingReminderJob, cancelPendingReminderJob }));

const { notifyManagersOfSelfReportSubmitted } = await import("./shootingRanges");

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "דני בדיקה",
    email: "dani@example.invalid",
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: "חובה",
    ...overrides,
  };
}

/** A `RecipientResolution` where every listed person resolved to a real Supabase account, keyed by their own personId (same shape `resolveNotificationRecipients` itself produces). */
function resolution(recipients: ResolvedRecipient[]): RecipientResolution {
  return {
    resolved: new Map(recipients.map((r) => [r.personId, r])),
    unmappedCount: 0,
    ambiguousEmailCount: 0,
    noEmailCount: 0,
  };
}

function recipient(personId: string, userId: string): ResolvedRecipient {
  return { personId, email: `${personId}@example.invalid`, userId };
}

describe("notifyManagersOfSelfReportSubmitted", () => {
  beforeEach(() => {
    resolveNotificationRecipients.mockReset();
    insertNotificationJobIfAbsent.mockReset();
    insertNotificationJobIfAbsent.mockResolvedValue(true);
  });

  it("creates one job per current manager, resolved via resolveNotificationRecipients + filterManagerRecipients", async () => {
    const mgr1 = person({ id: "mgr1", name: "מנהל אחד", isManager: true });
    const mgr2 = person({ id: "mgr2", name: "מנהל שתיים", isManager: true });
    resolveNotificationRecipients.mockResolvedValue(resolution([recipient("mgr1", "u_mgr1"), recipient("mgr2", "u_mgr2")]));

    await notifyManagersOfSelfReportSubmitted([mgr1, mgr2], "דני בדיקה", "2026-08-20", "report1");

    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(2);
    const recipientIds = insertNotificationJobIfAbsent.mock.calls.map(([job]) => job.recipientUserId);
    expect(recipientIds.sort()).toEqual(["u_mgr1", "u_mgr2"]);
  });

  it("non-managers receive nothing, even when they resolve to a real Supabase account", async () => {
    const nonManager = person({ id: "p1", isManager: false });
    resolveNotificationRecipients.mockResolvedValue(resolution([recipient("p1", "u1")]));

    await notifyManagersOfSelfReportSubmitted([nonManager], "דני בדיקה", "2026-08-20", "report1");

    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("a manager who cannot be resolved to a Supabase account (no email match) is silently skipped, never a thrown error", async () => {
    const mgr = person({ id: "mgr1", isManager: true });
    resolveNotificationRecipients.mockResolvedValue(resolution([])); // mgr1 never made it into `resolved`

    await expect(notifyManagersOfSelfReportSubmitted([mgr], "דני בדיקה", "2026-08-20", "report1")).resolves.toBeUndefined();
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("per-manager dedupe keys are distinct and keyed off the persisted report id, never a shared key", async () => {
    const mgr1 = person({ id: "mgr1", isManager: true });
    const mgr2 = person({ id: "mgr2", isManager: true });
    resolveNotificationRecipients.mockResolvedValue(resolution([recipient("mgr1", "u_mgr1"), recipient("mgr2", "u_mgr2")]));

    await notifyManagersOfSelfReportSubmitted([mgr1, mgr2], "דני בדיקה", "2026-08-20", "report1");

    const dedupeKeys = insertNotificationJobIfAbsent.mock.calls.map(([job]) => job.dedupeKey).sort();
    expect(dedupeKeys).toEqual([
      "shooting_range_self_report_submitted:report1:u_mgr1",
      "shooting_range_self_report_submitted:report1:u_mgr2",
    ]);
    expect(new Set(dedupeKeys).size).toBe(2);
  });

  it("a different report id for the SAME manager produces a different dedupe key -- two distinct submissions are never collapsed into one job", async () => {
    const mgr = person({ id: "mgr1", isManager: true });
    resolveNotificationRecipients.mockResolvedValue(resolution([recipient("mgr1", "u_mgr1")]));

    await notifyManagersOfSelfReportSubmitted([mgr], "דני בדיקה", "2026-08-20", "report1");
    await notifyManagersOfSelfReportSubmitted([mgr], "דני בדיקה", "2026-08-21", "report2");

    const dedupeKeys = insertNotificationJobIfAbsent.mock.calls.map(([job]) => job.dedupeKey);
    expect(dedupeKeys).toEqual([
      "shooting_range_self_report_submitted:report1:u_mgr1",
      "shooting_range_self_report_submitted:report2:u_mgr1",
    ]);
  });

  it("uses the correct category/title/body/path, with the date formatted DD.MM.YYYY", async () => {
    const mgr = person({ id: "mgr1", isManager: true });
    resolveNotificationRecipients.mockResolvedValue(resolution([recipient("mgr1", "u_mgr1")]));

    await notifyManagersOfSelfReportSubmitted([mgr], "דני בדיקה", "2026-08-20", "report1");

    expect(insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "shooting_range_self_report_submitted",
        recipientUserId: "u_mgr1",
        title: "🎯 דיווח מטווח חדש ממתין לאישור",
        body: "דני בדיקה דיווח שביצע מטווח בתאריך 20.08.2026.",
        path: "/shooting-ranges/manager",
        dedupeKey: "shooting_range_self_report_submitted:report1:u_mgr1",
      }),
    );
  });

  it("schedules the job immediately (scheduledFor is not in the future)", async () => {
    const mgr = person({ id: "mgr1", isManager: true });
    resolveNotificationRecipients.mockResolvedValue(resolution([recipient("mgr1", "u_mgr1")]));

    const before = Date.now();
    await notifyManagersOfSelfReportSubmitted([mgr], "דני בדיקה", "2026-08-20", "report1");

    const [job] = insertNotificationJobIfAbsent.mock.calls[0];
    expect(new Date(job.scheduledFor).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(job.scheduledFor).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
