import "server-only";
import { fetchRawWorkbookSnapshot } from "@/lib/google";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import {
  parseShootingRangeRelevanceSheet,
  parseShootingRangesSheet,
  type ShootingRangeRelevanceRecord,
  type ShootingRangeSheetRecord,
} from "@/lib/parsers/shootingRanges";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Event } from "@/lib/domain/event";
import type { Person } from "@/lib/domain/types";

export interface FreshWorkbookRead {
  people: Person[];
  events: Event[];
  shiftSchedule: ShiftSchedule;
  fetchedAt: string;
  /** The "מטווחים" sheet, already structurally parsed -- feeds the weapon-qualification "דורש טיפול" rule (`runWeaponQualificationCheck`), never re-fetched/re-parsed a second time for it. */
  shootingRangeSheetRecords: ShootingRangeSheetRecord[];
  shootingRangeRelevanceRecords: ShootingRangeRelevanceRecord[];
}

export type FreshWorkbookReadResult =
  | { status: "ok"; read: FreshWorkbookRead }
  | { status: "configuration_error"; message: string };

const REQUIRED_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "settings", "shootingRanges"];
const PERSONNEL_ONLY_SOURCES: SheetSourceKey[] = ["personnel"];

function getSheetByKey(snapshot: RawWorkbookSnapshot, key: SheetSourceKey): RawSheet {
  const name = SHEET_SOURCES[key];
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) throw new Error(`Workbook snapshot is missing the "${name}" sheet.`);
  return sheet;
}

/**
 * The notification worker's fresh, uncached read path. Deliberately
 * calls `fetchRawWorkbookSnapshot` (from `@/lib/google`) directly rather
 * than `lib/sync`'s `getWorkbookSnapshot` -- the latter is PR #27's
 * 30-second navigation cache, explicitly reserved for interactive
 * browsing (PR #30 spec section 6: "do NOT accidentally depend on the
 * user-navigation 30-second workbook cache"). Every worker tick gets a
 * genuine network round trip.
 *
 * Mirrors `loadPersonalScheduleReadModel`'s own parse orchestration
 * (personnel -> settings -> schedule -> events) so the worker's
 * normalized state is built from the exact same parsers/domain types
 * every other feature uses -- never a second, independent parsing path.
 */
export async function fetchFreshWorkbookRead(): Promise<FreshWorkbookReadResult> {
  const snapshot = await fetchRawWorkbookSnapshot(REQUIRED_SOURCES);

  const people = parsePersonnelSheet(getSheetByKey(snapshot, "personnel"));
  const settings = parseSettingsSheet(getSheetByKey(snapshot, "settings"));

  let shiftSchedule: ShiftSchedule;
  try {
    shiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (error instanceof ShiftConfigurationError) {
      return { status: "configuration_error", message: error.message };
    }
    throw error;
  }

  const rawAssignments = parseScheduleSheet(getSheetByKey(snapshot, "schedule"), people);
  const events = rawAssignments.map(parseEvent);

  const shootingRangesSheet = getSheetByKey(snapshot, "shootingRanges");
  const shootingRangeSheetRecords = parseShootingRangesSheet(shootingRangesSheet, people);
  const shootingRangeRelevanceRecords = parseShootingRangeRelevanceSheet(shootingRangesSheet, people);

  return {
    status: "ok",
    read: {
      people,
      events,
      shiftSchedule,
      fetchedAt: snapshot.fetchedAt,
      shootingRangeSheetRecords,
      shootingRangeRelevanceRecords,
    },
  };
}

export interface FreshPersonnelRead {
  people: Person[];
  fetchedAt: string;
}

/**
 * The dedicated scheduled-broadcast worker's fresh read path: personnel
 * ONLY, never schedule/settings. Same fresh/uncached `fetchRawWorkbookSnapshot`
 * call and the same `parsePersonnelSheet` this codebase uses everywhere
 * else (never a second personnel-parsing model) -- just a narrower source
 * list, since dispatching a scheduled broadcast only ever needs current
 * roster/auth-readiness state (`dispatchScheduledBroadcast` re-resolves
 * recipients fresh against `people`), never Schedule or Settings data.
 * This is the performance-critical piece that lets a once-a-minute worker
 * avoid the full three-sheet read `fetchFreshWorkbookRead` above performs.
 */
export async function fetchFreshPersonnelRead(): Promise<FreshPersonnelRead> {
  const snapshot = await fetchRawWorkbookSnapshot(PERSONNEL_ONLY_SOURCES);
  const people = parsePersonnelSheet(getSheetByKey(snapshot, "personnel"));
  return { people, fetchedAt: snapshot.fetchedAt };
}
