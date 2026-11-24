"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatBookingDate, formatCents } from "@/i18n/format";
import { MAX_DECKCHAIRS_PER_UMBRELLA, MAX_SPOTS_PER_BOOKING } from "@/lib/beach/limits";
import type { OpenSeason } from "@/lib/booking/seasons";
import type { Suggestion } from "@/lib/booking/suggest";
import type { Suggestion as Price } from "@/lib/pricing/suggest";
import { suggestQuickBookAction } from "./booking-actions";

/** What staff typed into quick book, handed to the booking form with the suggested umbrellas. */
export interface QuickBookDraft {
  customerName: string;
  customerPhone: string;
  startDate: string;
  endDate: string;
  asPass: boolean;
  umbrellas: number;
  sunbeds: number;
  /** Handed to the booking form, which caps it per umbrella (ADR 0020). */
  deckchairs: number;
}

export interface QuickBookPick {
  draft: QuickBookDraft;
  suggestions: Suggestion[];
  /** The suggested price for what was asked (ADR 0029); null when it can't be priced. */
  price: Price | null;
}

type ErrorKey =
  "noFit" | "tooManySunbeds" | "past" | "invalid" | "forbidden" | "rateLimited" | "generic";

const field = "min-h-11 rounded border px-2 py-2";

interface FormProps {
  areaId: number;
  areaName: string;
  date: string;
  today: string;
  /** The season a pass can be sold for; with none, only day bookings are offered. */
  openSeason: OpenSeason | null;
  /** The last request, when staff come back to change it. */
  initial: QuickBookDraft | null;
  onSuggested: (pick: QuickBookPick) => void;
  onClose: () => void;
}

/**
 * Quick book starts today at the earliest, also for a pass: it never sells days already over,
 * unlike the map's pass form, which allows a holder who arrived yesterday.
 */
function firstQuickDay(date: string, today: string, season: OpenSeason | null): string {
  const first = season && season.startDate > today ? season.startDate : today;
  return date < first ? first : date;
}

/** Name, phone, how many umbrellas and sunbeds, and when: the app picks the umbrellas. */
export function QuickBookForm(props: FormProps) {
  const { areaId, areaName, date, today, openSeason, initial, onSuggested, onClose } = props;
  const t = useTranslations("quickBook");
  const tb = useTranslations("booking");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ key: ErrorKey; free?: number } | null>(null);
  const [asPass, setAsPass] = useState(!!openSeason && !!initial?.asPass);
  const season = asPass ? openSeason : null;
  const [startDate, setStartDate] = useState(initial?.startDate ?? (date < today ? today : date));
  const [endDate, setEndDate] = useState(initial?.endDate ?? (date < today ? today : date));

  function togglePass(checked: boolean) {
    setAsPass(checked);
    setFailure(null);
    const first = firstQuickDay(date, today, checked ? openSeason : null);
    setStartDate(first);
    setEndDate(first);
  }

  function changeStart(value: string) {
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const draft: QuickBookDraft = {
      customerName: String(form.get("customerName") ?? ""),
      customerPhone: String(form.get("customerPhone") ?? ""),
      startDate,
      endDate: season ? season.endDate : endDate,
      asPass: !!season,
      umbrellas: Number(form.get("umbrellas")),
      sunbeds: Number(form.get("sunbeds")),
      deckchairs: Number(form.get("deckchairs")),
    };
    startTransition(async () => {
      try {
        const result = await suggestQuickBookAction({
          areaId,
          umbrellas: draft.umbrellas,
          sunbeds: draft.sunbeds,
          deckchairs: draft.deckchairs,
          startDate: draft.startDate,
          endDate: draft.endDate,
        });
        if (result.ok) onSuggested({ draft, suggestions: result.suggestions, price: result.price });
        else if (result.error === "noFit") setFailure({ key: "noFit", free: result.free });
        else setFailure({ key: result.error });
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} data-testid="quick-book-form" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("title", { area: areaName })}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {tb("customerName")}
        <input
          name="customerName"
          required
          maxLength={100}
          defaultValue={initial?.customerName}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {tb("customerPhone")}
        <input
          name="customerPhone"
          type="tel"
          inputMode="tel"
          maxLength={30}
          defaultValue={initial?.customerPhone}
          className={field}
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("umbrellas")}
          <input
            name="umbrellas"
            type="number"
            required
            min={1}
            max={MAX_SPOTS_PER_BOOKING}
            defaultValue={initial?.umbrellas ?? 1}
            data-testid="quick-book-umbrellas"
            className={field}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("sunbeds")}
          <input
            name="sunbeds"
            type="number"
            required
            min={0}
            max={200}
            defaultValue={initial?.sunbeds ?? 2}
            data-testid="quick-book-sunbeds"
            className={field}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {tb("deckchairs")}
          <input
            name="deckchairs"
            type="number"
            required
            min={0}
            max={MAX_SPOTS_PER_BOOKING * MAX_DECKCHAIRS_PER_UMBRELLA}
            defaultValue={initial?.deckchairs ?? 0}
            data-testid="quick-book-deckchairs"
            className={field}
          />
        </label>
      </div>
      {openSeason && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={asPass}
            onChange={(e) => togglePass(e.target.checked)}
            data-testid="quick-book-pass"
            className="size-5"
          />
          {tb("seasonPass")}
        </label>
      )}
      {season ? (
        <label key="pass" className="flex flex-col gap-1 text-sm">
          {tb("firstDay")}
          <input
            type="date"
            required
            min={firstQuickDay(today, today, season)}
            max={season.endDate}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={field}
          />
        </label>
      ) : (
        <div key="days" className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {tb("from")}
            <input
              type="date"
              required
              min={today}
              value={startDate}
              onChange={(e) => changeStart(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {tb("to")}
            <input
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
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          data-testid="quick-book-suggest"
          className="flex-1 rounded bg-blue-700 px-3 py-3 font-semibold text-white disabled:opacity-60"
        >
          {pending ? t("searching") : t("suggest")}
        </button>
        <button type="button" onClick={onClose} className="rounded border px-3 py-3">
          {tb("close")}
        </button>
      </div>
      {failure && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(`errors.${failure.key}`, { free: failure.free ?? 0 })}
        </p>
      )}
    </form>
  );
}

interface BarProps {
  pick: QuickBookPick;
  index: number;
  /** Staff changed the umbrellas on the map, or one was booked elsewhere meanwhile. */
  edited: boolean;
  onAnother: () => void;
  /** `viaKeyboard`: see `onSpotClick` in beach-map.tsx. */
  onChange: (viaKeyboard: boolean) => void;
}

/** Which suggestion is on the map, how it is laid out, and the way to the next one. */
export function SuggestionBar({ pick, index, edited, onAnother, onChange }: BarProps) {
  const t = useTranslations("quickBook");
  const tb = useTranslations("booking");
  const locale = useLocale();
  const suggestion = pick.suggestions[index];
  const { startDate, endDate } = pick.draft;
  const format = (d: string) => formatBookingDate(d, isLocale(locale) ? locale : defaultLocale);
  return (
    <div className="flex flex-col gap-2 rounded bg-blue-50 dark:bg-blue-950 p-3 text-sm">
      {edited ? (
        <p data-testid="quick-book-edited" className="font-semibold">
          {t("edited")}
        </p>
      ) : (
        <p data-testid="quick-book-suggestion" className="font-semibold">
          {t("suggestion", {
            index: index + 1,
            total: pick.suggestions.length,
            spots: suggestion.spots.map((s) => s.number).join(", "),
          })}
        </p>
      )}
      <p>
        {t("summary", {
          layout: t(`layout.${suggestion.layout}`),
          dates:
            startDate === endDate
              ? format(startDate)
              : tb("range", { from: format(startDate), to: format(endDate) }),
        })}
      </p>
      {pick.price && (
        <p data-testid="quick-book-price">
          {t(pick.price.discountPercent > 0 ? "priceDiscount" : "price", {
            price: formatCents(pick.price.totalCents, isLocale(locale) ? locale : defaultLocale),
            pieces: pick.price.pieces,
            percent: pick.price.discountPercent,
          })}
        </p>
      )}
      <p className="text-gray-700 dark:text-gray-300">{t("editHint")}</p>
      <div className="flex gap-2">
        {pick.suggestions.length > 1 && (
          <button
            type="button"
            onClick={onAnother}
            data-testid="quick-book-another"
            className="min-h-11 rounded border bg-white dark:bg-gray-900 px-3 py-2"
          >
            {t("another")}
          </button>
        )}
        <button
          type="button"
          onClick={(event) => onChange(event.detail === 0)}
          className="min-h-11 rounded border bg-white dark:bg-gray-900 px-3 py-2"
        >
          {t("change")}
        </button>
      </div>
    </div>
  );
}
