import { grantAppRole, parseAppDatabaseUrl, type AppAccount } from "./app-role";
import { createDb } from "./client";
import { runMigrations, type Direction } from "./migrator";
import { getEnv } from "@/lib/env";

type Command = Direction | "grant";

function parseCommand(arg: string | undefined): Command {
  if (arg === "up" || arg === "down" || arg === "grant") return arg;
  throw new Error(`Usage: migrate.ts <up|down|grant> (got "${arg ?? ""}")`);
}

/** Checked before migrating: refused after the migrations, the box would be left migrated
 * with an app that can't connect. */
function appAccount(): AppAccount | undefined {
  const raw = process.env.APP_DATABASE_URL;
  if (!raw) {
    console.warn("warning: APP_DATABASE_URL is not set: the app keeps the owner account");
    return undefined;
  }
  const account = parseAppDatabaseUrl(raw);
  if (typeof account === "string") throw new Error(account);
  return account;
}

/**
 * `up` migrates, then grants the app role (and sets its password from APP_DATABASE_URL when
 * given). `grant` only grants: after restoring a backup into an installed release.
 */
async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  const account = appAccount();
  const db = createDb(getEnv().DATABASE_URL);
  try {
    if (command === "grant") {
      console.log(`granted ${await grantAppRole(db, account)}`);
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
    if (command === "up") console.log(`granted ${await grantAppRole(db, account)}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
