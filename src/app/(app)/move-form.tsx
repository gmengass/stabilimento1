"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import type { Occupant } from "@/lib/booking/bookings";
import { moveBookingAction } from "./booking-actions";
import {
  ErrorLine,
  field,
  later,
  StockWarning,
  useStockWarning,
  type Failure,
} from "./booking-panel";

/** Where each of the booking's umbrellas goes: spot id → the new umbrella's id and number. */
export type MoveTargets = Record<number, { spotId: number; number: number }>;

interface Props {
  occupant: Occupant;
  date: string;
  today: string;
  targets: MoveTargets;
  /** The umbrella the next tap on the map is for, if any is left. */
  activeSpotId: number | null;
  onPickFor: (spotId: number) => void;
  onKeep: (spotId: number) => void;
  onBack: () => void;
  onDone: () => void;
}

type MoveFailure = Exclude<Awaited<ReturnType<typeof moveBookingAction>>, { ok: true }>;

function toFailure(result: Exclude<MoveFailure, { error: "stock" }>): Failure {
  if (result.error === "invalid") return { key: "invalidMove" };
  if (result.error !== "taken") return { key: result.error };
  if (result.clashes.length === 0) return { key: "takenNow" };
  return { key: "taken", clashes: result.clashes };
}

/**
 * Moves a booking: each umbrella gets a new one tapped on the map, or keeps its own. A booking
 * that hasn't started may also get new dates; a started one or a pass moves from a chosen day.
 */
export function MoveForm(props: Props) {
  const { occupant, date, today, targets, activeSpotId, onPickFor, onKeep, onBack, onDone } = props;
  const t = useTranslations("booking");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const stock = useStockWarning();
  const canMoveDates = occupant.kind !== "season" && occupant.startDate >= today;
  const [startDate, setStartDate] = useState(occupant.startDate);
  const [endDate, setEndDate] = useState(occupant.endDate);
  const firstDay = later(occupant.startDate, today);
  const [fromDate, setFromDate] = useState(
    later(firstDay, date > occupant.endDate ? occupant.endDate : date),
  );

  function changeStart(value: string) {
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    const spots = occupant.spots.map((s) => ({
      fromSpotId: s.spotId,
      toSpotId: targets[s.spotId]?.spotId ?? s.spotId,
    }));
    const when = canMoveDates ? { startDate, endDate } : { fromDate };
    const request = { bookingId: occupant.bookingId, spots, ...when };
    const key = JSON.stringify(request);
    const allowOverStock = stock.allows(key);
    startTransition(async () => {
      try {
        const result = await moveBookingAction({ ...request, allowOverStock });
        if (result.ok) onDone();
        else if (result.error === "stock") stock.warn(key, result.days);
        else setFailure(toFailure(result));
      } catch {
        setFailure({ key: "generic" });
      }
    });
  }

  const active = occupant.spots.find((s) => s.spotId === activeSpotId);
  // Two umbrellas can't go to the same one: pick another before confirming.
  const chosen = occupant.spots.map((s) => targets[s.spotId]?.spotId ?? s.spotId);
  const distinct = new Set(chosen).size === chosen.length;

  return (
    <form
      onSubmit={onSubmit}
      onChange={stock.clear}
      className="flex flex-col gap-3"
      data-testid="move-form"
    >
      <h2 className="text-lg font-semibold">{t("moveTitle")}</h2>
      <p className="text-sm text-gray-700 dark:text-gray-300">{t("moveHint")}</p>
      {active && (
        <p role="status" className="text-sm font-semibold text-blue-800 dark:text-blue-300">
          {t("moveTapFor", { number: active.number })}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {occupant.spots.map((s) => {
          const target = targets[s.spotId];
          return (
            <li key={s.spotId} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => onPickFor(s.spotId)}
                aria-pressed={s.spotId === activeSpotId}
                className="min-h-11 flex-1 rounded border px-3 py-2 text-left font-semibold aria-pressed:border-blue-700 dark:aria-pressed:border-blue-400"
              >
                {t("moveArrow", { from: s.number, to: target ? target.number : s.number })}
              </button>
              <button
                type="button"
                onClick={() => onKeep(s.spotId)}
                disabled={!target}
                className="min-h-11 rounded border px-3 py-2 disabled:opacity-60"
              >
                {t("moveKeep")}
              </button>
            </li>
          );
        })}
      </ul>
      {canMoveDates ? (
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t("from")}
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
            {t("to")}
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
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          {t("moveFromDay")}
          <input
            type="date"
            required
            min={firstDay}
            max={occupant.endDate}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={field}
          />
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !distinct}
          className="min-h-11 flex-1 rounded bg-blue-700 px-3 py-2 font-semibold text-white disabled:opacity-60"
        >
          {pending ? t("saving") : stock.days ? t("moveAnyway") : t("moveConfirm")}
        </button>
        <button type="button" onClick={onBack} className="min-h-11 flex-1 rounded border px-3 py-2">
          {t("moveBack")}
        </button>
      </div>
      {stock.days && <StockWarning days={stock.days} />}
      <ErrorLine failure={failure} />
    </form>
  );
}
