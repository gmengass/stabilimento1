import { sql, type Kysely } from "kysely";

// Sunbed and deckchair stock moves from the venue to each beach space (ADR 0026). NULL still means
// not tracked. A stock already entered for the venue goes to the first space, so no number is lost.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table area
    add column sunbed_stock integer
      constraint area_sunbed_stock_range check (sunbed_stock between 0 and 9999),
    add column deckchair_stock integer
      constraint area_deckchair_stock_range check (deckchair_stock between 0 and 9999)`.execute(db);
  await sql`update area set sunbed_stock = v.sunbed_stock, deckchair_stock = v.deckchair_stock
    from venue v
    where area.id = (select min(a.id) from area a where a.venue_id = v.id)`.execute(db);
  await sql`alter table venue drop column deckchair_stock, drop column sunbed_stock`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table venue
    add column sunbed_stock integer
      constraint venue_sunbed_stock_range check (sunbed_stock between 0 and 9999),
    add column deckchair_stock integer
      constraint venue_deckchair_stock_range check (deckchair_stock between 0 and 9999)`.execute(
    db,
  );
  await sql`update venue set
      sunbed_stock = (select sum(sunbed_stock)::int from area where venue_id = venue.id),
      deckchair_stock = (select sum(deckchair_stock)::int from area where venue_id = venue.id)`.execute(
    db,
  );
  await sql`alter table area drop column deckchair_stock, drop column sunbed_stock`.execute(db);
}
