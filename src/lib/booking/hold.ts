import { sql, type Kysely } from "kysely";
import type { DB } from "@/db/types";
import { timeZone } from "@/i18n/config";
import { venueToday } from "@/i18n/format";
import { writeEntry } from "./audit";

/** Any second app process skips a run while another holds this lock (ADR 0015). */
const HOLD_LOCK = 4_015;

const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Minutes the venue's clock is ahead of UTC at this instant. */
function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return Math.round((local - at.getTime()) / 60_000);
}

/**
 * The instant a booking day's hold ends: `holdTime` (HH:MM, local) on `date` at the venue. The
 * job computes the same in SQL; this mirrors it for the map and tests.
 */
export function holdInstant(date: string, holdTime: string): Date {
  const match = TIME.exec(holdTime);
  if (!match) throw new RangeError(`Invalid hold time: ${JSON.stringify(holdTime)}`);
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes, seconds = 0] = match.slice(1).map((v) => Number(v ?? 0));
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const first = asUtc - offsetMinutes(new Date(asUtc)) * 60_000;
  return new Date(asUtc - offsetMinutes(new Date(first)) * 60_000);
}

/** "HH:MM" from a Postgres `time` ("11:00:00"). */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

export interface HoldRun {
  bookings: number;
  umbrellas: number;
}

async function runIn(tx: Kysely<DB>, today: string, now: Date): Promise<HoldRun> {
  const { rows: lock } = await sql<{ got: boolean }>`
    select pg_try_advisory_xact_lock(${HOLD_LOCK}) as got`.execute(tx);
  if (!lock[0]?.got) return { bookings: 0, umbrellas: 0 };
  // Lock the due bookings first; one being checked in right now is skipped until the next run.
  const { rows: due } = await sql<{ id: number }>`
    select b.id from booking b
    cross join lateral (
      select ((${today}::date + coalesce(b.hold_until, v.default_hold_until))
        at time zone ${timeZone}) as at
      from booking_spot bs0
      join spot s0 on s0.id = bs0.spot_id
      join area a0 on a0.id = s0.area_id
      join venue v on v.id = a0.venue_id
      where bs0.booking_id = b.id
      order by bs0.id limit 1
    ) hold
    where b.status = 'active' and b.kind <> 'season'
      and b.start_date <= ${today} and b.end_date >= ${today}
      and ${now} >= hold.at and b.created_at < hold.at
      and exists (select 1 from spot_day sd join booking_spot bs on bs.id = sd.booking_spot_id
        where bs.booking_id = b.id and sd.date = ${today} and sd.state = 'booked')
    order by b.id
    for update of b skip locked`.execute(tx);
  if (due.length === 0) return { bookings: 0, umbrellas: 0 };
  // A new statement sees every check-in that committed before we got the locks.
  const { rows: flagged } = await sql<{ bookingId: number }>`
    update spot_day sd set state = 'no_show'
    from booking_spot bs
    where bs.id = sd.booking_spot_id
      and bs.booking_id in (${sql.join(due.map((d) => d.id))})
      and sd.date = ${today} and sd.state = 'booked'
      and not exists (select 1 from check_in c where c.booking_id = bs.booking_id
        and c.date = ${today})
    returning bs.booking_id as "bookingId"`.execute(tx);
  const run = {
    bookings: new Set(flagged.map((f) => f.bookingId)).size,
    umbrellas: flagged.length,
  };
  if (run.umbrellas > 0) {
    await writeEntry(tx, { userId: null, action: "no_show", detail: { date: today, ...run } });
  }
  return run;
}

/**
 * The hold rule (ADR 0004, ADR 0015): today's day and multi-day bookings not checked in by their
 * hold time become `no_show`, so their umbrellas can be booked again. Past days are left alone.
 * Safe to run any number of times.
 */
export async function applyHoldRule(db: Kysely<DB>, now: Date = new Date()): Promise<HoldRun> {
  const today = venueToday(now);
  return db.transaction().execute((tx) => runIn(tx, today, now));
}
