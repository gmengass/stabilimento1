import { sql, type Kysely } from "kysely";

// The phone number is optional: walk-in customers often give only a name. No phone is NULL;
// the existing check still refuses a phone without a digit.

/** Rolling back needs a value in every row; "0" passes the digit check and is clearly not a number. */
const NO_PHONE_PLACEHOLDER = "0";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table booking alter column customer_phone drop not null`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`update booking set customer_phone = ${NO_PHONE_PLACEHOLDER}
    where customer_phone is null`.execute(db);
  await sql`alter table booking alter column customer_phone set not null`.execute(db);
}
