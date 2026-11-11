import { createDb } from "./client";
import { runMigrations, type Direction } from "./migrator";
import { getEnv } from "@/lib/env";

function parseDirection(arg: string | undefined): Direction {
  if (arg === "up" || arg === "down") return arg;
  throw new Error(`Usage: migrate.ts <up|down> (got "${arg ?? ""}")`);
}

async function main(): Promise<void> {
  const direction = parseDirection(process.argv[2]);
  const db = createDb(getEnv().DATABASE_URL);
  try {
    const { error, results = [] } = await runMigrations(db, direction);
    for (const r of results) {
      console.log(
        `${r.status.padEnd(7)} ${r.direction.toLowerCase().padEnd(4)} ${r.migrationName}`,
      );
    }
    if (results.length === 0) console.log("Nothing to do.");
    if (error) throw error;
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
