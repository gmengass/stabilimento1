// The page's own admin saves (ADR 0030): a setup signal this soon after one is that save, not a
// change from another device. Marked when a save starts and again when it returns.

export const OWN_WRITE_MS = 10_000;

let lastOwnWrite = Number.NEGATIVE_INFINITY;

export function markOwnWrite(now = Date.now()): void {
  lastOwnWrite = now;
}

export function isOwnWrite(now = Date.now()): boolean {
  return now - lastOwnWrite <= OWN_WRITE_MS;
}

/** Runs a save, marking it as this page's own write before and after. */
export async function ownWrite<R>(call: () => Promise<R>): Promise<R> {
  markOwnWrite();
  try {
    return await call();
  } finally {
    markOwnWrite();
  }
}
