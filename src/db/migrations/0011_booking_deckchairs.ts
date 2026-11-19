import { sql, type Kysely } from "kysely";

// Deckchairs (sdraie) asked for with a booking (ADR 0020). The app caps them at 2 per umbrella;
// 40 (20 umbrellas × 2) is only a backstop. Existing bookings get 0.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table booking add column deckchairs smallint not null default 0
    constraint booking_deckchairs_range check (deckchairs between 0 and 40)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table booking drop column deckchairs`.execute(db);
}
