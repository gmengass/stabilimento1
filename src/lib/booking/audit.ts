import { sql, type Kysely } from "kysely";
import type { BookingKind, DB, SpotDayState } from "@/db/types";
import type { Role } from "@/lib/auth/rules";

/** The map lists at most this many of today's entries, newest first (ADR 0024). */
export const ACTIVITY_CAP = 500;
/** Staff may undo their own entries for this long; admins any time. */
export const UNDO_WINDOW_MS = 30 * 60_000;

export type AuditAction =
  | "book"
  | "cancel"
  | "set_last_day"
  | "release"
  | "restore"
  | "move"
  | "check_in"
  | "uncheck"
  | "hold"
  | "no_show"
  | "undo"
  | "beach"
  | "season";

export interface DayRow {
  bookingSpotId: number;
  spotId: number;
  date: string;
  state: SpotDayState;
}

export interface MovedDay {
  bookingSpotId: number;
  spotId: number;
  date: string;
  from: SpotDayState;
  to: SpotDayState;
}

export interface BookingState {
  status: "active" | "cancelled";
  endDate: string;
  /** Recorded by a move, which may change the dates; older entries leave them out. */
  startDate?: string;
  kind?: BookingKind;
  /** Recorded by a hold change ("HH:MM" or null for the venue's time); others leave it out. */
  holdUntil?: string | null;
}

/** Whether the booking was checked in on a day, before and after the change (ADR 0015). */
export interface CheckInFlag {
  date: string;
  before: boolean;
  after: boolean;
}

/** A booking_spot's flags before and after a move: whether it is one of the booking's umbrellas. */
export interface SpotFlag {
  bookingSpotId: number;
  before: { current: boolean; sunbeds: number };
  after: { current: boolean; sunbeds: number };
}

/**
 * Exactly what one action changed, so undo can reverse it. A new booking's `before` is
 * "cancelled": undoing it cancels it, like a cancel, and keeps any day already used on record.
 */
export interface RecordedChange {
  before: BookingState;
  after: BookingState;
  added: DayRow[];
  removed: DayRow[];
  moved: MovedDay[];
  /** Umbrellas a move took on or gave up. */
  spots?: SpotFlag[];
  /** Check-ins the change added or removed. */
  checkIns?: CheckInFlag[];
}

export type Detail = Record<string, string | number>;

export interface EntryToWrite {
  /** Null only for the automatic no-show run (ADR 0015). */
  userId: string | null;
  action: AuditAction;
  bookingId?: number;
  detail?: Detail;
  change?: RecordedChange;
  undoesId?: number;
}

/** Writes one entry. Call it inside the change's own transaction. */
export async function writeEntry(db: Kysely<DB>, entry: EntryToWrite): Promise<number> {
  const { id } = await db
    .insertInto("audit_log")
    .values({
      user_id: entry.userId,
      action: entry.action,
      booking_id: entry.bookingId ?? null,
      detail: JSON.stringify(entry.detail ?? {}),
      change: entry.change ? JSON.stringify(entry.change) : null,
      undoes_id: entry.undoesId ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

/** A booking that stays as it was, with these days moved between states. */
export function movedOnly(state: BookingState, moved: MovedDay[]): RecordedChange {
  return { before: state, after: state, added: [], removed: [], moved };
}

export interface ActivityEntry {
  id: number;
  at: Date;
  /** Null for the automatic no-show run, shown as "System". */
  userId: string | null;
  userName: string | null;
  action: AuditAction;
  detail: Detail;
  bookingId: number | null;
  kind: BookingKind | null;
  customerName: string | null;
  startDate: string | null;
  endDate: string | null;
  spots: number[];
  /** For an undo: the action it reversed. */
  undoesAction: AuditAction | null;
  undoable: boolean;
  undone: boolean;
}

/** The entries from `since` on for the whole venue, newest first, at most `cap` (ADR 0024). */
export async function listActivity(
  db: Kysely<DB>,
  since: Date,
  cap = ACTIVITY_CAP,
): Promise<ActivityEntry[]> {
  const rows = await db
    .selectFrom("audit_log as a")
    .leftJoin("user as u", "u.id", "a.user_id")
    .leftJoin("booking as b", "b.id", "a.booking_id")
    .leftJoin("audit_log as o", "o.id", "a.undoes_id")
    .select((eb) => [
      "a.id",
      "a.created_at as at",
      "a.user_id as userId",
      "u.name as userName",
      "a.action",
      "a.detail",
      "a.booking_id as bookingId",
      "b.kind",
      "b.customer_name as customerName",
      "b.start_date as startDate",
      "b.end_date as endDate",
      "o.action as undoesAction",
      sql<boolean>`a.change is not null`.as("undoable"),
      sql<boolean>`a.undone_by_id is not null`.as("undone"),
      eb
        .selectFrom("booking_spot as bs")
        .innerJoin("spot as s", "s.id", "bs.spot_id")
        .select(sql<number[]>`array_agg(s.number order by s.number)`.as("n"))
        .whereRef("bs.booking_id", "=", "a.booking_id")
        .where("bs.current", "=", true)
        .as("spots"),
    ])
    .where("a.created_at", ">=", since)
    .orderBy("a.id", "desc")
    .limit(cap)
    .execute();
  return rows.map((row) => ({
    ...row,
    at: new Date(row.at),
    action: row.action as AuditAction,
    undoesAction: row.undoesAction as AuditAction | null,
    detail: (row.detail ?? {}) as Detail,
    spots: row.spots ?? [],
  }));
}

export interface Viewer {
  id: string;
  role: Role;
}

/** Whether this viewer may undo the entry (ADR 0013). The undo itself checks again. */
export function mayUndo(
  entry: Pick<ActivityEntry, "userId" | "at" | "undoable" | "undone">,
  viewer: Viewer,
  now: Date = new Date(),
): boolean {
  if (!entry.undoable || entry.undone) return false;
  if (viewer.role === "admin") return true;
  return entry.userId === viewer.id && now.getTime() - entry.at.getTime() <= UNDO_WINDOW_MS;
}
