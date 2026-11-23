import { grantAppRole } from "./app-role";
import { createDb } from "./client";
import { runMigrations, type Direction } from "./migrator";
import { getEnv } from "@/lib/env";

type Command = Direction | "grant";

function parseCommand(arg: string | undefined): Command {
  if (arg === "up" || arg === "down" || arg === "grant") return arg;
  throw new Error(`Usage: migrate.ts <up|down|grant> (got "${arg ?? ""}")`);
}

/**
 * `up` migrates, then grants the app role (and sets its password from APP_DB_PASSWORD when
 * given). `grant` only grants: after restoring a backup into an installed release.
 */
async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  const db = createDb(getEnv().DATABASE_URL);
  const password = process.env.APP_DB_PASSWORD || undefined;
  try {
    if (command === "grant") {
      console.log(`granted ${await grantAppRole(db, password)}`);
      return;
    }
    const { error, results = [] } = await runMigrations(db, command);
    for (const r of results) {
      console.log(
        `${r.status.padEnd(7)} ${r.direction.toLowerCase().padEnd(4)} ${r.migrationName}`,
      );
    }
    if (results.length === 0) console.log("Nothing to do.");
    if (error) throw error;
    if (command === "up") console.log(`granted ${await grantAppRole(db, password)}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
