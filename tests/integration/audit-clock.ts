import { sql, type Kysely } from "kysely";
import type { DB } from "@/db/types";
import { venueDayStart } from "@/i18n/format";

/** Sets when an audit entry happened, so tests need no real clock (ADR 0024). */
export async function stampEntry(db: Kysely<DB>, entryId: number, at: Date): Promise<void> {
  await sql`update audit_log set created_at = ${at.toISOString()}::timestamptz where id = ${entryId}`.execute(
    db,
  );
}

/** Makes an entry count as made during booking day `today`, at 10:00 venue time. */
export async function stampToday(db: Kysely<DB>, entryId: number, today: string): Promise<void> {
  await stampEntry(db, entryId, new Date(venueDayStart(today).getTime() + 10 * 3_600_000));
}
