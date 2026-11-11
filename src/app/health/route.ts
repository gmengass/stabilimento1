import { sql } from "kysely";
import { connection } from "next/server";
import { getDb } from "@/db/client";

type HealthBody = { status: "ok" | "error"; db: "ok" | "error" };

async function checkDb(): Promise<boolean> {
  try {
    await sql`select 1`.execute(getDb());
    return true;
  } catch {
    return false;
  }
}

export async function GET(): Promise<Response> {
  await connection();
  const dbOk = await checkDb();
  const body: HealthBody = dbOk ? { status: "ok", db: "ok" } : { status: "error", db: "error" };
  return Response.json(body, { status: dbOk ? 200 : 503 });
}
