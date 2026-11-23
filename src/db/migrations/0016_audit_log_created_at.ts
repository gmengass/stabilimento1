import { sql, type Kysely } from "kysely";

// The map lists the audit entries since the start of today (ADR 0024). Without an index on
// `created_at` that query reads the whole log on every map load, and the log only grows.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create index audit_log_created_at_idx on audit_log (created_at)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index audit_log_created_at_idx`.execute(db);
}
