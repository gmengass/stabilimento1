"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatBookingDate } from "@/i18n/format";
import type { MapSpot } from "@/lib/beach/layout";
import type { Clash, Occupant } from "@/lib/booking/bookings";
import type { OpenSeason } from "@/lib/booking/seasons";
import {
  cancelBookingAction,
  createBookingAction,
  createSeasonPassAction,
  endSeasonPassAction,
  releaseDaysAction,
  restoreDaysAction,
} from "./booking-actions";

type ErrorKey =
  | "invalid"
  | "invalidPass"
  | "invalidDays"
  | "invalidLastDay"
  | "sunbeds"
  | "taken"
  | "takenNow"
  | "forbidden"
  | "notFound"
  | "ended"
  | "notSeason"
  | "past"
  | "generic";
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

type DaysFailure = Exclude<Awaited<ReturnType<typeof releaseDaysAction>>, { ok: true }>;

/** A lost race whose winner is already gone has no clash to name: ask to try again. */
function toFailure(result: CreateFailure | DaysFailure, invalid: ErrorKey = "invalid"): Failure {
  if (result.error === "invalid") return { key: invalid };
  if (result.error !== "taken") return { key: result.error };
  if (result.clashes.length === 0) return { key: "takenNow" };
  return { key: "taken", clashes: result.clashes };
}

interface NewProps {
  areaName: string;
  date: string;
  spots: MapSpot[];
  /** The season a pass can be sold for; with none, only day bookings are offered. */
  openSeason: OpenSeason | null;
  onRemove: (spotId: number) => void;
  onDone: () => void;
}

/** A pass sold mid-season starts on the day shown; one sold early starts on opening day. */
function firstDayIn(season: OpenSeason, date: string): string {
  if (date < season.startDate) return season.startDate;
  return date > season.endDate ? season.endDate : date;
}

export function NewBookingForm({ areaName, date, spots, openSeason, onRemove, onDone }: NewProps) {
  const t = useTranslations("booking");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);
  const [asPass, setAsPass] = useState(false);
  const season = asPass ? openSeason : null;
  const formatDate = useDate();

  function togglePass(checked: boolean) {
    setAsPass(checked);
    setFailure(null);
    if (checked && openSeason) setStartDate(firstDayIn(openSeason, date));
    else changeStart(date);
  }

  function changeStart(value: string) {
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customer = {
      customerName: form.get("customerName"),
      customerPhone: form.get("customerPhone"),
      startDate: form.get("startDate"),
      notes: form.get("notes"),
      spots: spots.map((s) => ({ spotId: s.id, sunbeds: Number(form.get(`sunbeds-${s.id}`)) })),
    };
    startTransition(async () => {
      try {
        const booking = { ...customer, endDate: form.get("endDate") };
        const result = season
          ? await createSeasonPassAction({ ...booking, seasonId: season.id })
          : await createBookingAction(booking);
        if (result.ok) onDone();
        else setFailure(toFailure(result, season ? "invalidPass" : "invalid"));
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("newTitle", { area: areaName })}</h2>
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
        <input name="customerPhone" type="tel" inputMode="tel" maxLength={30} className={field} />
      </label>
      {openSeason && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={asPass}
            onChange={(e) => togglePass(e.target.checked)}
            className="size-5"
          />
          {t("seasonPass")}
        </label>
      )}
      {/* Keys: without them React reuses the "to" input, and its date would end the pass. */}
      {season ? (
        <div key="pass" className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm">
            {t("firstDay")}
            <input
              name="startDate"
              type="date"
              required
              min={season.startDate}
              max={season.endDate}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("lastDayOptional")}
            <input
              name="endDate"
              type="date"
              min={startDate}
              max={season.endDate}
              className={field}
            />
            <span className="text-gray-600">
              {t("lastDayHint", { date: formatDate(season.endDate) })}
            </span>
          </label>
        </div>
      ) : (
        <div key="days" className="flex gap-2">
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
      )}
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
        {pending ? t("saving") : t(season ? "sellPass" : "book", { count: spots.length })}
      </button>
      <ErrorLine failure={failure} />
    </form>
  );
}

/** A free umbrella whose season-pass holder gave this day back: staff can give it back. */
export function ReleasedDay({ pass, date }: { pass: Occupant; date: string }) {
  const t = useTranslations("booking");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);

  function restore() {
    startTransition(async () => {
      try {
        const day = { bookingId: pass.bookingId, startDate: date, endDate: date };
        const result = await restoreDaysAction(day);
        if (!result.ok) setFailure(toFailure(result, "invalidDays"));
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-violet-300 bg-violet-50 p-3 text-sm">
      <p>{t("releasedBy", { name: pass.customerName })}</p>
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="rounded border border-violet-700 px-3 py-2 text-violet-900 disabled:opacity-60"
      >
        {pending ? t("saving") : t("restore", { name: pass.customerName })}
      </button>
      <ErrorLine failure={failure} />
    </div>
  );
}

/** Release days of a season pass, starting from the day shown on the map. */
function ReleaseForm({ occupant, date }: { occupant: Occupant; date: string }) {
  const t = useTranslations("booking");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [released, setReleased] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);

  function changeStart(value: string) {
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    setReleased(null);
    startTransition(async () => {
      try {
        const days = { bookingId: occupant.bookingId, startDate, endDate };
        const result = await releaseDaysAction(days);
        if (result.ok) setReleased(result.days);
        else setFailure(toFailure(result, "invalidDays"));
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded border p-3">
      <h3 className="font-semibold">{t("releaseTitle")}</h3>
      <p className="text-sm text-gray-700">{t("releaseHint")}</p>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("from")}
          <input
            type="date"
            required
            min={occupant.startDate}
            max={occupant.endDate}
            value={startDate}
            onChange={(e) => changeStart(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("to")}
          <input
            type="date"
            required
            min={startDate}
            max={occupant.endDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <button type="submit" disabled={pending} className="rounded border px-3 py-2">
        {pending ? t("saving") : t("release")}
      </button>
      {released !== null && (
        <p role="status" className="text-sm text-green-700">
          {t("releasedDone", { count: released })}
        </p>
      )}
      <ErrorLine failure={failure} />
    </form>
  );
}

/** Set the holder's last day once they know it; the pass then ends that day. */
function LastDayForm({ occupant, date }: { occupant: Occupant; date: string }) {
  const t = useTranslations("booking");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lastDay = new FormData(event.currentTarget).get("lastDay");
    setFailure(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await endSeasonPassAction({ bookingId: occupant.bookingId, lastDay });
        if (result.ok) setSaved(true);
        else setFailure({ key: result.error === "invalid" ? "invalidLastDay" : result.error });
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded border p-3">
      <h3 className="font-semibold">{t("lastDayTitle")}</h3>
      <p className="text-sm text-gray-700">{t("lastDayHelp")}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t("lastDay")}
        <input
          name="lastDay"
          type="date"
          required
          min={occupant.startDate}
          max={occupant.endDate}
          defaultValue={date}
          className={field}
        />
      </label>
      <button type="submit" disabled={pending} className="rounded border px-3 py-2">
        {pending ? t("saving") : t("setLastDay")}
      </button>
      {saved && (
        <p role="status" className="text-sm text-green-700">
          {t("lastDaySaved")}
        </p>
      )}
      <ErrorLine failure={failure} />
    </form>
  );
}

interface DetailsProps {
  occupant: Occupant;
  /** The day shown on the map. */
  date: string;
  onClose: () => void;
}

export function BookingDetails({ occupant, date, onClose }: DetailsProps) {
  const t = useTranslations("booking");
  const formatDate = useDate();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const sameDay = occupant.startDate === occupant.endDate;
  const isPass = occupant.kind === "season";

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
      {occupant.customerPhone && (
        <a href={`tel:${occupant.customerPhone.replace(/[^\d+]/g, "")}`} className="underline">
          {occupant.customerPhone}
        </a>
      )}
      {isPass && (
        <p className="flex flex-wrap gap-x-3 text-sm text-violet-900">
          <span className="font-semibold">{t("passTitle")}</span>
          <span>{t("releasedCount", { count: occupant.releasedDays })}</span>
        </p>
      )}
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
      {isPass && <ReleaseForm occupant={occupant} date={date} />}
      {isPass && <LastDayForm occupant={occupant} date={date} />}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded border border-red-300 bg-red-50 p-3">
          <p className="text-sm">{t(isPass ? "cancelPassConfirm" : "cancelConfirm")}</p>
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
