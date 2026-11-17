"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatBookingDate } from "@/i18n/format";
import type { Clash } from "@/lib/booking/bookings";
import { undoAction } from "./booking-actions";

type ErrorKey =
  | "changed"
  | "ended"
  | "undone"
  | "forbidden"
  | "notFound"
  | "invalid"
  | "taken"
  | "takenNow"
  | "generic";

interface Failure {
  key: ErrorKey;
  clashes?: Clash[];
}

type UndoFailure = Exclude<Awaited<ReturnType<typeof undoAction>>, { ok: true }>;

/** A lost race whose winner is already gone has no clash to name. */
function toFailure(result: UndoFailure): Failure {
  if (result.error !== "taken") return { key: result.error };
  if (result.clashes.length === 0) return { key: "takenNow" };
  return { key: "taken", clashes: result.clashes };
}

/** One tap: the server re-checks who may undo and whether it still can (ADR 0013). */
export function UndoButton({ entryId, label }: { entryId: number; label: string }) {
  const t = useTranslations("activity");
  const tBooking = useTranslations("booking.errors");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const formatDate = (date: string) =>
    formatBookingDate(date, isLocale(locale) ? locale : defaultLocale);

  function onUndo() {
    setFailure(null);
    startTransition(async () => {
      try {
        const result = await undoAction({ entryId });
        if (!result.ok) setFailure(toFailure(result));
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onUndo}
        disabled={pending}
        aria-label={label}
        className="min-h-11 rounded border px-3 py-2 font-medium disabled:opacity-50"
      >
        {pending ? t("undoing") : t("undoButton")}
      </button>
      {failure && (
        <div role="alert" className="basis-full text-red-700">
          <p>{t(`errors.${failure.key}`)}</p>
          {failure.clashes && (
            <ul className="list-disc pl-5">
              {failure.clashes.slice(0, 10).map((c) => (
                <li key={`${c.spotNumber}-${c.date}`}>
                  {tBooking("clash", { number: c.spotNumber, date: formatDate(c.date) })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
