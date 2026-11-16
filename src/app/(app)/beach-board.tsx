"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { BeachMap, type SpotView } from "@/components/beach-map";
import type { MapLine, MapSpot } from "@/lib/beach/layout";
import type { Occupant } from "@/lib/booking/bookings";
import type { OpenSeason } from "@/lib/booking/seasons";
import { BookingDetails, NewBookingForm, ReleasedDay } from "./booking-panel";
import { QuickBookForm, SuggestionBar, type QuickBookPick } from "./quick-book";

interface Props {
  /** The venue's today: past days can't be released, restored or sold as a pass. */
  today: string;
  areaId: number;
  areaName: string;
  date: string;
  lines: MapLine[];
  occupancy: Record<number, Occupant>;
  /** Season passes that gave this day back, by spot: free to book, or to give back. */
  released: Record<number, Occupant>;
  /** The season a pass can be sold for, if one is open. */
  openSeason: OpenSeason | null;
}

/** The map plus its side panel: pick free umbrellas to book, or tap a booked one to see it. */
export function BeachBoard({
  today,
  areaId,
  areaName,
  date,
  lines,
  occupancy,
  released,
  openSeason,
}: Props) {
  const t = useTranslations("quickBook");
  const [selected, setSelected] = useState<MapSpot[]>([]);
  const [openBooking, setOpenBooking] = useState<number | null>(null);
  /** Quick book: the request form is open, or a suggestion is on the map. */
  const [quickForm, setQuickForm] = useState(false);
  const [pick, setPick] = useState<QuickBookPick | null>(null);
  const [pickIndex, setPickIndex] = useState(0);
  const open = Object.values(occupancy).find((o) => o.bookingId === openBooking);
  // A booking made or cancelled elsewhere can make the selection stale: drop booked spots.
  const freeSelected = selected.filter((s) => !occupancy[s.id]);

  const spotById = new Map(lines.flatMap((line) => line.spots.map((s) => [s.id, s])));

  function showSuggestion(next: QuickBookPick, index: number) {
    const spots = next.suggestions[index].spots.flatMap((s) => spotById.get(s.spotId) ?? []);
    setPick(next);
    setPickIndex(index);
    setQuickForm(false);
    setOpenBooking(null);
    setSelected(spots);
  }

  function openQuickBook() {
    setSelected([]);
    setPick(null);
    setOpenBooking(null);
    setQuickForm(true);
  }

  function reset() {
    setSelected([]);
    setPick(null);
    setQuickForm(false);
  }

  function onSpotClick(spot: MapSpot) {
    const occupant = occupancy[spot.id];
    if (occupant) {
      setSelected([]);
      setPick(null);
      setQuickForm(false);
      setOpenBooking(occupant.bookingId === openBooking ? null : occupant.bookingId);
      return;
    }
    setOpenBooking(null);
    setQuickForm(false);
    const next = selected.some((s) => s.id === spot.id)
      ? selected.filter((s) => s.id !== spot.id)
      : [...selected, spot];
    changeSelection(next);
  }

  /** An emptied selection ends quick book: the next tap starts a new, blank booking. */
  function changeSelection(next: MapSpot[]) {
    setSelected(next);
    if (next.length === 0) setPick(null);
  }

  function viewOf(spot: MapSpot): SpotView {
    const occupant = occupancy[spot.id];
    if (occupant?.bookingId === openBooking) return "open";
    if (occupant) return occupant.kind === "season" ? "season" : "booked";
    if (freeSelected.some((s) => s.id === spot.id)) return "selected";
    return released[spot.id] ? "released" : "free";
  }

  // One line per pass, even when several of its umbrellas are selected.
  const releasedSelected = [
    ...new Map(
      freeSelected
        .flatMap((s) => (released[s.id] ? [released[s.id]] : []))
        .map((pass) => [pass.bookingId, pass]),
    ).values(),
  ];

  const suggestion = pick?.suggestions[pickIndex];
  const sunbedsOf = Object.fromEntries(suggestion?.spots.map((s) => [s.spotId, s.sunbeds]) ?? []);
  const asSuggested =
    !!suggestion &&
    suggestion.spots.length === freeSelected.length &&
    suggestion.spots.every((s) => freeSelected.some((f) => f.id === s.spotId));

  const panel = open ? (
    <BookingDetails
      key={open.bookingId}
      occupant={open}
      date={date}
      today={today}
      onClose={() => setOpenBooking(null)}
    />
  ) : freeSelected.length > 0 ? (
    <div className="flex flex-col gap-4">
      {pick && (
        <SuggestionBar
          pick={pick}
          index={pickIndex}
          edited={!asSuggested}
          onAnother={() => showSuggestion(pick, (pickIndex + 1) % pick.suggestions.length)}
          onChange={() => {
            setSelected([]);
            setQuickForm(true);
          }}
        />
      )}
      {releasedSelected.map((pass) => (
        <ReleasedDay key={pass.bookingId} pass={pass} date={date} today={today} />
      ))}
      <NewBookingForm
        key={pick ? `${date}-quick-${pickIndex}` : date}
        areaName={areaName}
        date={date}
        today={today}
        spots={freeSelected}
        openSeason={openSeason}
        initial={pick ? { draft: pick.draft, sunbeds: sunbedsOf } : undefined}
        onRemove={(id) => changeSelection(selected.filter((s) => s.id !== id))}
        onDone={reset}
      />
    </div>
  ) : quickForm ? (
    <QuickBookForm
      key={pick ? "change" : date}
      areaId={areaId}
      areaName={areaName}
      date={date}
      today={today}
      openSeason={openSeason}
      initial={pick?.draft ?? null}
      onSuggested={(next) => showSuggestion(next, 0)}
      onClose={reset}
    />
  ) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-2">
        <button
          type="button"
          onClick={openQuickBook}
          data-testid="quick-book-open"
          className="self-start rounded bg-blue-700 px-4 py-2 font-semibold text-white"
        >
          {t("open")}
        </button>
        <BeachMap
          areaName={areaName}
          lines={lines}
          viewOf={viewOf}
          captionOf={(spot) => (occupancy[spot.id] ?? released[spot.id])?.customerName}
          onSpotClick={onSpotClick}
        />
      </div>
      {panel && <aside className="rounded border p-4 lg:sticky lg:top-4">{panel}</aside>}
    </div>
  );
}
