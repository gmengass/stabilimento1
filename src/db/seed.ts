import { createDb } from "./client";
import { seedDemo } from "./seed-data";
import { getEnv } from "@/lib/env";

async function main(): Promise<void> {
  const db = createDb(getEnv().DATABASE_URL);
  try {
    await seedDemo(db);
    console.log("Demo seed loaded.");
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
