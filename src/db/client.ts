import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { getEnv } from "@/lib/env";
import type { DB } from "./types";

const PG_DATE_OID = 1082;

// Booking days are local calendar dates (ADR 0004): keep `date` columns as "YYYY-MM-DD"
// strings so they are never shifted by a time zone conversion.
pg.types.setTypeParser(PG_DATE_OID, (value: string) => value);

export function createDb(connectionString: string): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 10 }) }),
  });
}

let db: Kysely<DB> | undefined;

export function getDb(): Kysely<DB> {
  db ??= createDb(getEnv().DATABASE_URL);
  return db;
}
