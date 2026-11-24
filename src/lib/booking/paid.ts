import type { Kysely } from "kysely";
import { z } from "zod";
import type { DB } from "@/db/types";
import { bookingSuggestion } from "@/lib/pricing/price-list";
import { movedOnly, writeEntry, type PaidState } from "./audit";

const paidSchema = z.object({ bookingId: z.number().int().positive(), paid: z.boolean() });

export type PaidResult =
  { ok: true } | { ok: false; error: "invalid" | "notFound" | "cancelled" | "unchanged" };

/** A booking row's paid columns as the audit log records them. */
export function paidState(row: {
  paid_at: string | Date | null;
  paid_by: string | null;
  paid_suggested_cents: number | null;
}): PaidState | null {
  if (row.paid_at === null || row.paid_by === null) return null;
  return {
    at: new Date(row.paid_at).toISOString(),
    by: row.paid_by,
    suggestedCents: row.paid_suggested_cents,
  };
}

/** The paid columns to write for a state (null clears them). */
export function paidColumns(state: PaidState | null) {
  return {
    paid_at: state ? new Date(state.at) : null,
    paid_by: state?.by ?? null,
    paid_suggested_cents: state?.suggestedCents ?? null,
  };
}

/**
 * Ticks a booking paid, or clears the tick (ADR 0029). Ticking records who, when, and the
 * suggested price at that moment, so the panel can warn when the price changes afterwards. Both
 * write an activity entry that can be undone. Finished bookings may be ticked: passes are paid at
 * the end. Cancelled ones may not.
 */
export async function setPaid(
  db: Kysely<DB>,
  userId: string,
  input: unknown,
  now: Date = new Date(),
): Promise<PaidResult> {
  const parsed = paidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { bookingId, paid } = parsed.data;
  return db.transaction().execute(async (tx) => {
    const row = await tx
      .selectFrom("booking")
      .select(["status", "end_date", "paid_at", "paid_by", "paid_suggested_cents"])
      .where("id", "=", bookingId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) return { ok: false, error: "notFound" } as const;
    if (row.status === "cancelled") return { ok: false, error: "cancelled" } as const;
    const before = paidState(row);
    if ((before !== null) === paid) return { ok: false, error: "unchanged" } as const;
    const suggestion = paid ? await bookingSuggestion(tx, bookingId) : null;
    const after: PaidState | null = paid
      ? { at: now.toISOString(), by: userId, suggestedCents: suggestion?.totalCents ?? null }
      : null;
    await tx.updateTable("booking").set(paidColumns(after)).where("id", "=", bookingId).execute();
    const state = { status: "active", endDate: row.end_date } as const;
    await writeEntry(tx, {
      userId,
      action: paid ? "paid" : "unpaid",
      bookingId,
      detail: suggestion ? { suggestedCents: suggestion.totalCents } : {},
      change: {
        ...movedOnly(state, []),
        before: { ...state, paid: before },
        after: { ...state, paid: after },
      },
    });
    return { ok: true } as const;
  });
}
