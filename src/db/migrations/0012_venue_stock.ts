import { sql, type Kysely } from "kysely";

// Sunbed (lettini) and deckchair (sdraie) stock for the whole venue (ADR 0021). NULL means not
// tracked, so existing venues behave as before until an admin sets a number.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table venue
    add column sunbed_stock integer
      constraint venue_sunbed_stock_range check (sunbed_stock between 0 and 9999),
    add column deckchair_stock integer
      constraint venue_deckchair_stock_range check (deckchair_stock between 0 and 9999)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table venue drop column deckchair_stock, drop column sunbed_stock`.execute(db);
}
