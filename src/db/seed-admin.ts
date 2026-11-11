import { getAuth } from "@/lib/auth/auth";
import { getDb } from "./client";
import { ensureAdmin, type EnsureAdminOutcome } from "./ensure-admin";

const MESSAGES: Record<EnsureAdminOutcome, string> = {
  created: "Admin created. Now remove ADMIN_PASSWORD from .env.",
  exists: "Admin already exists, unchanged",
  takenByStaff: "ADMIN_USERNAME belongs to a staff account: choose another username",
};

// Creates the first admin from ADMIN_USERNAME / ADMIN_PASSWORD. Safe to run again, also in
// production: an existing account is left untouched.
async function main(): Promise<void> {
  const db = getDb();
  try {
    const outcome = await ensureAdmin(getAuth(), db, {
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
    });
    console.log(MESSAGES[outcome]);
    if (outcome === "takenByStaff") process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
