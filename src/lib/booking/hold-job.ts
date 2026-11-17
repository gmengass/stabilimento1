import { getDb } from "@/db/client";
import { applyHoldRule } from "./hold";

export const HOLD_JOB_INTERVAL_MS = 60_000;

let started = false;

async function runOnce(): Promise<void> {
  try {
    await applyHoldRule(getDb());
  } catch (error) {
    // A failed run is retried a minute later; it must never take the server down.
    console.error("hold job failed", error);
  }
}

/**
 * Applies the hold rule now (catch-up after a restart) and then every minute (ADR 0015). Calling
 * it again does nothing. The timer doesn't keep the process alive on shutdown.
 */
export function startHoldJob(): void {
  if (started) return;
  started = true;
  void runOnce();
  setInterval(() => void runOnce(), HOLD_JOB_INTERVAL_MS).unref();
}
