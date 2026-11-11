import { promises as fs } from "node:fs";
import path from "node:path";
import type { Kysely } from "kysely";
import { FileMigrationProvider, Migrator, type MigrationResultSet } from "kysely/migration";

const migrationFolder = path.join(import.meta.dirname, "migrations");

export function createMigrator<T>(db: Kysely<T>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
  });
}

export type Direction = "up" | "down";

export async function runMigrations<T>(
  db: Kysely<T>,
  direction: Direction,
): Promise<MigrationResultSet> {
  const migrator = createMigrator(db);
  return direction === "up" ? migrator.migrateToLatest() : migrator.migrateDown();
}
