"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { useActing } from "@/components/acting";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatBookingDate } from "@/i18n/format";
import type { MapSpot } from "@/lib/beach/layout";
import { MAX_DECKCHAIRS_PER_UMBRELLA } from "@/lib/beach/limits";
import type { Clash, Occupant } from "@/lib/booking/bookings";
import { addDays } from "@/i18n/format";
import type { OpenSeason } from "@/lib/booking/seasons";
import type { OverStockDay } from "@/lib/booking/stock";
import type { QuickBookDraft } from "./quick-book";
import {
  cancelBookingAction,
  checkInAction,
  createBookingAction,
  createSeasonPassAction,
  endSeasonPassAction,
  releaseDaysAction,
  restoreDaysAction,
  restoreNoShowAction,
  setHoldAction,
  uncheckAction,
} from "./booking-actions";
import { PriceBox } from "./price-box";
import { sunDanger, sunDangerFilled, sunPrimary, sunSecondary } from "@/components/button-classes";

export type ErrorKey =
  | "invalid"
  | "invalidMove"
  | "unchanged"
  | "split"
  | "started"
  | "invalidPass"
  | "invalidDays"
  | "invalidLastDay"
  | "sunbeds"
  | "taken"
  | "takenNow"
  | "forbidden"
  | "rateLimited"
  | "notFound"
  | "ended"
  | "notSeason"
  | "past"
  | "pastBooking"
  | "notToday"
  | "noShow"
  | "released"
  | "season"
  | "invalidHold"
  | "stock"
  | "cancelled"
  | "generic";
export interface Failure {
  key: ErrorKey;
  clashes?: Clash[];
}

export const field = "min-h-11 rounded border px-2 py-2";

export function useDate(): (date: string) => string {
  const locale = useLocale();
  return (date) => formatBookingDate(date, isLocale(locale) ? locale : defaultLocale);
}

export function ErrorLine({ failure }: { failure: Failure | null }) {
  const t = useTranslations("booking.errors");
  const formatDate = useDate();
  if (!failure) return null;
  return (
    <div role="alert" className="text-sm text-red-700 dark:text-red-400">
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

/**
 * The stock warning (ADR 0021): the days a booking would take sunbeds or deckchairs past the
 * venue's stock. Sending the same request again with `allowOverStock` saves it anyway.
 */
export function StockWarning({ days }: { days: OverStockDay[] }) {
  const t = useTranslations("booking.stock");
  const formatDate = useDate();
  const shown = days.slice(0, 10);
  return (
    <div
      role="alert"
      data-testid="stock-warning"
      className="text-sm text-amber-800 dark:text-amber-300"
    >
      <p>{t("warning")}</p>
      <ul className="list-disc pl-5">
        {shown.map((day) => (
          <li key={day.date}>
            {t("day", {
              date: formatDate(day.date),
              items: [
                day.sunbeds > 0 && t("sunbedsOver", { count: day.sunbeds }),
                day.deckchairs > 0 && t("deckchairsOver", { count: day.deckchairs }),
              ]
                .filter(Boolean)
                .join(", "),
            })}
          </li>
        ))}
      </ul>
      {days.length > shown.length && <p>{t("more", { count: days.length - shown.length })}</p>}
    </div>
  );
}

/** Warn once, then let the same request through: any change to it needs a fresh check. */
export function useStockWarning() {
  const [warning, setWarning] = useState<{ key: string; days: OverStockDay[] } | null>(null);
  return {
    days: warning?.days ?? null,
    allows: (key: string) => warning?.key === key,
    warn: (key: string, days: OverStockDay[]) => setWarning({ key, days }),
    clear: () => setWarning(null),
  };
}

/** What an action can refuse with once the tablet's "who is acting" pop-up has had its say. */
type FailureOf<A extends (...args: never[]) => Promise<unknown>> = Exclude<
  Awaited<ReturnType<A>>,
  { ok: true } | { error: "needsActor" }
>;

type CreateFailure = FailureOf<typeof createBookingAction>;

type DaysFailure = FailureOf<typeof releaseDaysAction>;

type NoShowFailure = FailureOf<typeof restoreNoShowAction>;

/** A lost race whose winner is already gone has no clash to name: ask to try again. */
function toFailure(
  result: CreateFailure | DaysFailure | NoShowFailure,
  invalid: ErrorKey = "invalid",
): Failure {
  if (result.error === "invalid") return { key: invalid };
  if (result.error !== "taken") return { key: result.error };
  if (result.clashes.length === 0) return { key: "takenNow" };
  return { key: "taken", clashes: result.clashes };
}

interface NewProps {
  areaName: string;
  date: string;
  spots: MapSpot[];
  today: string;
  /** The season a pass can be sold for; with none, only day bookings are offered. */
  openSeason: OpenSeason | null;
  /** Filled in by quick book: who, when, and the sunbeds it spread over the umbrellas. */
  initial?: { draft: QuickBookDraft; sunbeds: Record<number, number> };
  onRemove: (spotId: number) => void;
  onDone: () => void;
}

/** The later of two local dates. */
export function later(a: string, b: string): string {
  return a > b ? a : b;
}

/** The day shown, kept between the first and last allowed days. */
function clamp(date: string, first: string, last: string): string {
  if (date < first) return first;
  return date > last ? last : date;
}

/** A pass can start no earlier than yesterday (the server's rule) nor before the season. */
function firstPassDay(season: OpenSeason, today: string): string {
  return later(season.startDate, addDays(today, -1));
}

export function NewBookingForm(props: NewProps) {
  const { areaName, date, today, spots, openSeason, initial, onRemove, onDone } = props;
  const t = useTranslations("booking");
  const { run } = useActing();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const draft = initial?.draft;
  const [asPass, setAsPass] = useState(!!openSeason && !!draft?.asPass);
  const [startDate, setStartDate] = useState(draft?.startDate ?? date);
  const [endDate, setEndDate] = useState(draft && !draft.asPass ? draft.endDate : date);
  const season = asPass ? openSeason : null;
  const [checkIn, setCheckIn] = useState(true);
  const startsToday = !season && startDate === today && endDate === today;
  const maxDeckchairs = spots.length * MAX_DECKCHAIRS_PER_UMBRELLA;
  // Controlled and clamped: removing an umbrella lowers the cap, and the choice follows it.
  const [deckchairs, setDeckchairs] = useState(draft?.deckchairs ?? 0);
  const formatDate = useDate();
  const stock = useStockWarning();

  function togglePass(checked: boolean) {
    setAsPass(checked);
    setFailure(null);
    if (checked && openSeason) {
      setStartDate(clamp(date, firstPassDay(openSeason, today), openSeason.endDate));
    } else changeStart(date);
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
      deckchairs: Number(form.get("deckchairs")),
    };
    const request = { ...customer, endDate: form.get("endDate"), seasonId: season?.id };
    const key = JSON.stringify(request);
    const allowOverStock = stock.allows(key);
    startTransition(async () => {
      try {
        const { seasonId, ...booking } = { ...request, allowOverStock };
        const result = await run(() =>
          seasonId !== undefined
            ? createSeasonPassAction({ ...booking, seasonId })
            : createBookingAction({ ...booking, checkIn: startsToday && checkIn }),
        );
        if (!result) return;
        if (result.ok) onDone();
        else if (result.error === "stock") {
          setFailure(null);
          stock.warn(key, result.days);
        } else {
          stock.clear();
          if (result.error === "past") setFailure({ key: season ? "past" : "pastBooking" });
          else setFailure(toFailure(result, season ? "invalidPass" : "invalid"));
        }
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} onChange={stock.clear} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold sun:hidden">{t("newTitle", { area: areaName })}</h2>
      <ul className="flex flex-col gap-2">
        {spots.map((spot) => (
          <li key={spot.id} className="flex items-center gap-2 text-sm">
            <span className="w-12 font-semibold">{spot.number}</span>
            <label className="flex items-center gap-1">
              {t("sunbeds")}
              <select
                name={`sunbeds-${spot.id}`}
                defaultValue={initial?.sunbeds[spot.id] ?? spot.includedSunbeds}
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
              className={`ml-auto min-h-11 rounded border px-3 py-2 ${sunSecondary}`}
              aria-label={t("removeSpot", { number: spot.number })}
            >
              {t("remove")}
            </button>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-1 text-sm">
        {t("deckchairs")}
        <select
          name="deckchairs"
          value={Math.min(deckchairs, maxDeckchairs)}
          onChange={(e) => setDeckchairs(Number(e.target.value))}
          data-testid="booking-deckchairs"
          className={field}
        >
          {Array.from({ length: maxDeckchairs + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("customerName")}
        <input
          name="customerName"
          required
          maxLength={100}
          defaultValue={draft?.customerName}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("customerPhone")}
        <input
          name="customerPhone"
          type="tel"
          inputMode="tel"
          maxLength={30}
          defaultValue={draft?.customerPhone}
          className={field}
        />
      </label>
      {openSeason && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
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
              min={firstPassDay(season, today)}
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
            <span className="text-gray-600 dark:text-gray-400">
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
              min={today}
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
      {startsToday && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checkIn}
            onChange={(e) => setCheckIn(e.target.checked)}
            data-testid="booking-check-in"
            className="size-5"
          />
          {t("checkInNow")}
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        {t("notes")}
        <textarea name="notes" maxLength={500} rows={2} className={field} />
        <span className="text-gray-600 dark:text-gray-400">{t("notesHint")}</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className={`rounded bg-blue-700 px-3 py-3 font-semibold text-white disabled:opacity-60 ${sunPrimary}`}
      >
        {pending
          ? t("saving")
          : stock.days
            ? t("bookAnyway")
            : t(season ? "sellPass" : "book", { count: spots.length })}
      </button>
      {stock.days && <StockWarning days={stock.days} />}
      <ErrorLine failure={failure} />
    </form>
  );
}

interface DayProps {
  date: string;
  today: string;
}

/** A free umbrella whose holder gave this day back. Past days can't be given back. */
export function ReleasedDay({ pass, date, today }: DayProps & { pass: Occupant }) {
  const t = useTranslations("booking");
  const { run } = useActing();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);

  function restore() {
    startTransition(async () => {
      try {
        const day = { bookingId: pass.bookingId, startDate: date, endDate: date };
        const result = await run(() => restoreDaysAction(day));
        if (!result) return;
        if (!result.ok) setFailure(toFailure(result, "invalidDays"));
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950 p-3 text-sm">
      <p>{t("releasedBy", { name: pass.customerName })}</p>
      {date >= today && (
        <button
          type="button"
          onClick={restore}
          disabled={pending}
          className="min-h-11 rounded border border-violet-700 dark:border-violet-400 px-3 py-2 text-violet-900 dark:text-violet-200 disabled:opacity-60"
        >
          {pending ? t("saving") : t("restore", { name: pass.customerName })}
        </button>
      )}
      <ErrorLine failure={failure} />
    </div>
  );
}

/**
 * A booking that missed the hold time on this umbrella (ADR 0004): who it was and, today, a way
 * to give the umbrellas back if they are all still free.
 */
export function NoShowDay({ noShow, date, today }: DayProps & { noShow: Occupant }) {
  const t = useTranslations("booking");
  const { run } = useActing();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);

  function restore() {
    startTransition(async () => {
      try {
        const result = await run(() => restoreNoShowAction({ bookingId: noShow.bookingId, date }));
        if (!result) return;
        // Already restored (another tablet got there first): the refreshed map shows it.
        if (!result.ok && result.error !== "unchanged") setFailure(toFailure(result));
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <div
      data-testid="no-show"
      className="flex flex-col gap-2 rounded border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950 p-3 text-sm"
    >
      <p>{t("noShowBy", { name: noShow.customerName, time: noShow.holdTime })}</p>
      {date === today && noShow.customerPhone && (
        <a
          href={`tel:${noShow.customerPhone.replace(/[^\d+]/g, "")}`}
          className="inline-flex min-h-11 items-center underline"
        >
          {noShow.customerPhone}
        </a>
      )}
      {date === today && (
        <button
          type="button"
          onClick={restore}
          disabled={pending}
          className="min-h-11 rounded border border-amber-700 dark:border-amber-500 px-3 py-2 text-amber-950 dark:text-amber-100 disabled:opacity-60"
        >
          {pending ? t("saving") : t("restoreNoShow", { name: noShow.customerName })}
        </button>
      )}
      <ErrorLine failure={failure} />
    </div>
  );
}

/** Today's arrival: check in, or take a mistaken check-in back. */
function CheckInButton({ occupant, date }: { occupant: Occupant; date: string }) {
  const t = useTranslations("booking");
  const { run } = useActing();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);

  function toggle() {
    startTransition(async () => {
      try {
        const input = { bookingId: occupant.bookingId, date };
        const result = await run(() => (occupant.checkedIn ? uncheckAction : checkInAction)(input));
        if (!result) return;
        // Already as wanted (another tablet got there first): the refreshed map shows it.
        if (!result.ok && result.error !== "unchanged") setFailure({ key: result.error });
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {occupant.checkedIn && (
        <p className="text-sm font-semibold text-teal-900 dark:text-teal-300">{t("checkedIn")}</p>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        data-testid={occupant.checkedIn ? "uncheck" : "check-in"}
        className={
          occupant.checkedIn
            ? `min-h-11 rounded border px-3 py-2 disabled:opacity-60 ${sunSecondary}`
            : `min-h-11 rounded bg-teal-700 px-3 py-2 font-semibold text-white disabled:opacity-60 ${sunPrimary}`
        }
      >
        {pending ? t("saving") : t(occupant.checkedIn ? "uncheck" : "checkIn")}
      </button>
      {occupant.checkedIn && (
        <p className="text-xs text-gray-700 dark:text-gray-300">{t("uncheckHint")}</p>
      )}
      <ErrorLine failure={failure} />
    </div>
  );
}

/** A late arrival: keep the umbrellas past the usual hold time (ADR 0004). */
function HoldForm({ occupant }: { occupant: Occupant }) {
  const t = useTranslations("booking");
  const { run } = useActing();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState(false);

  function save(holdUntil: string | null) {
    setSaved(false);
    setFailure(null);
    startTransition(async () => {
      try {
        const result = await run(() => setHoldAction({ bookingId: occupant.bookingId, holdUntil }));
        if (!result) return;
        if (result.ok || result.error === "unchanged") setSaved(true);
        else setFailure({ key: result.error === "invalid" ? "invalidHold" : result.error });
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("holdUntil") ?? "");
    save(value.slice(0, 5));
  }

  const usual = occupant.holdUntil === null;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded border p-3">
      <h3 className="font-semibold">{t("holdTitle")}</h3>
      <p className="text-xs text-gray-700 dark:text-gray-300">
        {t("holdHint", { time: occupant.usualHoldTime })}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        {t("holdLabel")}
        <input
          type="time"
          name="holdUntil"
          required
          defaultValue={occupant.holdTime}
          className={field}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className={`min-h-11 rounded border px-3 py-2 disabled:opacity-60 ${sunSecondary}`}
        >
          {pending ? t("saving") : t("holdSave")}
        </button>
        {!usual && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={pending}
            className={`min-h-11 rounded border px-3 py-2 disabled:opacity-60 ${sunSecondary}`}
          >
            {t("holdClear")}
          </button>
        )}
      </div>
      {saved && <p className="text-sm text-green-800 dark:text-green-400">{t("holdSaved")}</p>}
      <ErrorLine failure={failure} />
    </form>
  );
}

/** Release days of a season pass from today on, starting from the day shown on the map. */
function ReleaseForm({ occupant, date, today }: DayProps & { occupant: Occupant }) {
  const t = useTranslations("booking");
  const { run } = useActing();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [released, setReleased] = useState<number | null>(null);
  const first = later(occupant.startDate, today);
  const [startDate, setStartDate] = useState(clamp(date, first, occupant.endDate));
  const [endDate, setEndDate] = useState(clamp(date, first, occupant.endDate));

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
        const result = await run(() => releaseDaysAction(days));
        if (!result) return;
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
      <p className="text-sm text-gray-700 dark:text-gray-300">{t("releaseHint")}</p>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("from")}
          <input
            type="date"
            required
            min={first}
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
      <button
        type="submit"
        disabled={pending}
        className={`min-h-11 rounded border px-3 py-2 ${sunSecondary}`}
      >
        {pending ? t("saving") : t("release")}
      </button>
      {released !== null && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {t("releasedDone", { count: released })}
        </p>
      )}
      <ErrorLine failure={failure} />
    </form>
  );
}

/** Set the holder's last day once they know it; the pass then ends that day. */
function LastDayForm({ occupant, date, today }: DayProps & { occupant: Occupant }) {
  const first = later(occupant.startDate, addDays(today, -1));
  const t = useTranslations("booking");
  const { run } = useActing();
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
        const result = await run(() =>
          endSeasonPassAction({ bookingId: occupant.bookingId, lastDay }),
        );
        if (!result) return;
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
      <p className="text-sm text-gray-700 dark:text-gray-300">{t("lastDayHelp")}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t("lastDay")}
        <input
          name="lastDay"
          type="date"
          required
          min={first}
          max={occupant.endDate}
          defaultValue={clamp(date, first, occupant.endDate)}
          className={field}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className={`min-h-11 rounded border px-3 py-2 ${sunSecondary}`}
      >
        {pending ? t("saving") : t("setLastDay")}
      </button>
      {saved && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {t("lastDaySaved")}
        </p>
      )}
      <ErrorLine failure={failure} />
    </form>
  );
}

interface DetailsProps extends DayProps {
  occupant: Occupant;
  onClose: () => void;
  /** Starts moving the booking: taps on the map then pick its new umbrellas. */
  onMove: () => void;
}

export function BookingDetails({ occupant, date, today, onClose, onMove }: DetailsProps) {
  const t = useTranslations("booking");
  const formatDate = useDate();
  const { run } = useActing();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const sameDay = occupant.startDate === occupant.endDate;
  const isPass = occupant.kind === "season";

  function cancel() {
    startTransition(async () => {
      try {
        const result = await run(() => cancelBookingAction({ bookingId: occupant.bookingId }));
        if (!result) return;
        if (result.ok) onClose();
        else setFailure({ key: result.error });
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start sun:hidden">
        <h2 className="text-lg font-semibold">{occupant.customerName}</h2>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto min-h-11 rounded border px-3 py-2"
        >
          {t("close")}
        </button>
      </div>
      {occupant.customerPhone && (
        <a
          href={`tel:${occupant.customerPhone.replace(/[^\d+]/g, "")}`}
          className="inline-flex min-h-11 items-center underline"
        >
          {occupant.customerPhone}
        </a>
      )}
      {isPass && (
        <p className="flex flex-wrap gap-x-3 text-sm text-violet-900 dark:text-violet-200">
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
        {occupant.deckchairs > 0 && (
          <li data-testid="booking-deckchairs-line">
            {t("deckchairsLine", { count: occupant.deckchairs })}
          </li>
        )}
      </ul>
      {occupant.notes && <p className="text-sm whitespace-pre-wrap">{occupant.notes}</p>}
      <PriceBox occupant={occupant} />
      {date === today && <CheckInButton occupant={occupant} date={date} />}
      {!isPass && occupant.endDate >= today && date >= today && !occupant.checkedIn && (
        <HoldForm key={occupant.holdTime} occupant={occupant} />
      )}
      {occupant.endDate >= today && (
        <button
          type="button"
          onClick={onMove}
          data-testid="move-open"
          className={`min-h-11 rounded border px-3 py-2 ${sunSecondary}`}
        >
          {t("move")}
        </button>
      )}
      {isPass && occupant.endDate >= today && (
        <ReleaseForm occupant={occupant} date={date} today={today} />
      )}
      {isPass && occupant.endDate >= addDays(today, -1) && (
        <LastDayForm occupant={occupant} date={date} today={today} />
      )}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 sun:border-2 sun:border-[#8b1a1a] sun:bg-white sun:text-[#8b1a1a] sun:dark:border-[#f08a8a] sun:dark:bg-[#1e2f3d] sun:dark:text-[#f5b5b5]">
          <p className="text-sm">{t(isPass ? "cancelPassConfirm" : "cancelConfirm")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className={`min-h-11 flex-1 rounded bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-60 ${sunDangerFilled}`}
            >
              {pending ? t("saving") : t("cancelYes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`min-h-11 flex-1 rounded border px-3 py-2 ${sunSecondary}`}
            >
              {t("cancelNo")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`min-h-11 rounded border border-red-700 dark:border-red-400 px-3 py-2 text-red-700 dark:text-red-400 ${sunDanger}`}
        >
          {t("cancel")}
        </button>
      )}
      <ErrorLine failure={failure} />
    </div>
  );
}
