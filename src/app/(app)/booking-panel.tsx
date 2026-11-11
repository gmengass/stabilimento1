"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatBookingDate } from "@/i18n/format";
import type { MapSpot } from "@/lib/beach/layout";
import type { Clash, Occupant } from "@/lib/booking/bookings";
import { cancelBookingAction, createBookingAction } from "./booking-actions";

type ErrorKey =
  "invalid" | "sunbeds" | "taken" | "takenNow" | "forbidden" | "notFound" | "ended" | "generic";
interface Failure {
  key: ErrorKey;
  clashes?: Clash[];
}

const field = "rounded border px-2 py-2";

function useDate(): (date: string) => string {
  const locale = useLocale();
  return (date) => formatBookingDate(date, isLocale(locale) ? locale : defaultLocale);
}

function ErrorLine({ failure }: { failure: Failure | null }) {
  const t = useTranslations("booking.errors");
  const formatDate = useDate();
  if (!failure) return null;
  return (
    <div role="alert" className="text-sm text-red-700">
      <p>{t(failure.key)}</p>
      {failure.clashes && (
        <ul className="list-disc pl-5">
          {failure.clashes.slice(0, 10).map((c) => (
            <li key={`${c.spotNumber}-${c.date}`}>
              {t("clash", { number: c.spotNumber, date: formatDate(c.date) })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CreateFailure = Exclude<Awaited<ReturnType<typeof createBookingAction>>, { ok: true }>;

/** A lost race whose winner is already gone has no clash to name: ask to try again. */
function toFailure(result: CreateFailure): Failure {
  if (result.error !== "taken") return { key: result.error };
  if (result.clashes.length === 0) return { key: "takenNow" };
  return { key: "taken", clashes: result.clashes };
}

interface NewProps {
  date: string;
  spots: MapSpot[];
  onRemove: (spotId: number) => void;
  onDone: () => void;
}

export function NewBookingForm({ date, spots, onRemove, onDone }: NewProps) {
  const t = useTranslations("booking");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);

  function changeStart(value: string) {
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      customerName: form.get("customerName"),
      customerPhone: form.get("customerPhone"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate"),
      notes: form.get("notes"),
      spots: spots.map((s) => ({ spotId: s.id, sunbeds: Number(form.get(`sunbeds-${s.id}`)) })),
    };
    startTransition(async () => {
      try {
        const result = await createBookingAction(input);
        if (result.ok) onDone();
        else setFailure(toFailure(result));
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("newTitle")}</h2>
      <ul className="flex flex-col gap-2">
        {spots.map((spot) => (
          <li key={spot.id} className="flex items-center gap-2 text-sm">
            <span className="w-12 font-semibold">{spot.number}</span>
            <label className="flex items-center gap-1">
              {t("sunbeds")}
              <select
                name={`sunbeds-${spot.id}`}
                defaultValue={spot.includedSunbeds}
                className={field}
              >
                {Array.from({ length: spot.maxSunbeds + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onRemove(spot.id)}
              className="ml-auto rounded border px-2 py-1"
              aria-label={t("removeSpot", { number: spot.number })}
            >
              {t("remove")}
            </button>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-sm">
        {t("customerName")}
        <input name="customerName" required maxLength={100} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("customerPhone")}
        <input
          name="customerPhone"
          type="tel"
          inputMode="tel"
          required
          maxLength={30}
          className={field}
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("from")}
          <input
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => changeStart(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("to")}
          <input
            name="endDate"
            type="date"
            required
            min={startDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        {t("notes")}
        <textarea name="notes" maxLength={500} rows={2} className={field} />
        <span className="text-gray-600">{t("notesHint")}</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-700 px-3 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending ? t("saving") : t("book", { count: spots.length })}
      </button>
      <ErrorLine failure={failure} />
    </form>
  );
}

interface DetailsProps {
  occupant: Occupant;
  onClose: () => void;
}

export function BookingDetails({ occupant, onClose }: DetailsProps) {
  const t = useTranslations("booking");
  const formatDate = useDate();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const sameDay = occupant.startDate === occupant.endDate;

  function cancel() {
    startTransition(async () => {
      try {
        const result = await cancelBookingAction({ bookingId: occupant.bookingId });
        if (result.ok) onClose();
        else setFailure({ key: result.error });
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start">
        <h2 className="text-lg font-semibold">{occupant.customerName}</h2>
        <button type="button" onClick={onClose} className="ml-auto rounded border px-2 py-1">
          {t("close")}
        </button>
      </div>
      <a href={`tel:${occupant.customerPhone.replace(/[^\d+]/g, "")}`} className="underline">
        {occupant.customerPhone}
      </a>
      <p className="text-sm">
        {sameDay
          ? formatDate(occupant.startDate)
          : t("range", { from: formatDate(occupant.startDate), to: formatDate(occupant.endDate) })}
      </p>
      <ul className="text-sm">
        {occupant.spots.map((s) => (
          <li key={s.number}>{t("spotLine", { number: s.number, sunbeds: s.sunbeds })}</li>
        ))}
      </ul>
      {occupant.notes && <p className="text-sm whitespace-pre-wrap">{occupant.notes}</p>}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded border border-red-300 bg-red-50 p-3">
          <p className="text-sm">{t("cancelConfirm")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="flex-1 rounded bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-60"
            >
              {pending ? t("saving") : t("cancelYes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded border px-3 py-2"
            >
              {t("cancelNo")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded border border-red-700 px-3 py-2 text-red-700"
        >
          {t("cancel")}
        </button>
      )}
      <ErrorLine failure={failure} />
    </div>
  );
}
