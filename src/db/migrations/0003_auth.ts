import { sql, type Kysely, type RawBuilder } from "kysely";

// Better Auth tables (ADR 0002, ADR 0007). Columns are snake_case; the auth instance maps them
// with Kysely's CamelCasePlugin. Ids are Better Auth's random text ids.

const TABLES = ["user", "session", "account", "verification"] as const;

const upStatements: RawBuilder<unknown>[] = [
  sql`create table "user" (
    id text primary key,
    name text not null,
    email text not null unique,
    email_verified boolean not null default false,
    image text,
    username text not null unique check (username ~ '^[a-z0-9_.]{3,30}$'),
    display_username text,
    role text not null default 'staff' check (role in ('admin', 'staff')),
    banned boolean not null default false,
    ban_reason text,
    ban_expires timestamptz,
    locale text not null default 'it' check (locale in ('it', 'en')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  sql`create table session (
    id text primary key,
    user_id text not null references "user" (id) on delete cascade,
    token text not null unique,
    expires_at timestamptz not null,
    ip_address text,
    user_agent text,
    impersonated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  sql`create index session_user_id_idx on session (user_id)`,
  sql`create table account (
    id text primary key,
    user_id text not null references "user" (id) on delete cascade,
    account_id text not null,
    provider_id text not null,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamptz,
    refresh_token_expires_at timestamptz,
    scope text,
    password text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (provider_id, account_id)
  )`,
  sql`create index account_user_id_idx on account (user_id)`,
  sql`create table verification (
    id text primary key,
    identifier text not null,
    value text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  sql`create index verification_identifier_idx on verification (identifier)`,
  ...TABLES.map(
    (table) =>
      sql`create trigger ${sql.raw(`${table}_set_updated_at`)} before update on ${sql.table(table)}
        for each row execute function set_updated_at()`,
  ),
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const statement of upStatements) await statement.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [...TABLES].reverse()) await sql`drop table ${sql.table(table)}`.execute(db);
}
