"use client";

import { useState } from "react";
import { BeachMap, type SpotView } from "@/components/beach-map";
import type { MapLine, MapSpot } from "@/lib/beach/layout";
import type { Occupant } from "@/lib/booking/bookings";
import type { OpenSeason } from "@/lib/booking/seasons";
import { BookingDetails, NewBookingForm, ReleasedDay } from "./booking-panel";

interface Props {
  areaName: string;
  date: string;
  lines: MapLine[];
  occupancy: Record<number, Occupant>;
  /** Season passes that gave this day back, by spot: free to book, or to give back. */
  released: Record<number, Occupant>;
  /** Seasons a pass can be sold for. */
  seasons: OpenSeason[];
}

/** The map plus its side panel: pick free umbrellas to book, or tap a booked one to see it. */
export function BeachBoard({ areaName, date, lines, occupancy, released, seasons }: Props) {
  const [selected, setSelected] = useState<MapSpot[]>([]);
  const [openBooking, setOpenBooking] = useState<number | null>(null);
  const open = Object.values(occupancy).find((o) => o.bookingId === openBooking);
  // A booking made or cancelled elsewhere can make the selection stale: drop booked spots.
  const freeSelected = selected.filter((s) => !occupancy[s.id]);

  function onSpotClick(spot: MapSpot) {
    const occupant = occupancy[spot.id];
    if (occupant) {
      setSelected([]);
      setOpenBooking(occupant.bookingId === openBooking ? null : occupant.bookingId);
      return;
    }
    setOpenBooking(null);
    setSelected((current) =>
      current.some((s) => s.id === spot.id)
        ? current.filter((s) => s.id !== spot.id)
        : [...current, spot],
    );
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

  const panel = open ? (
    <BookingDetails
      key={open.bookingId}
      occupant={open}
      date={date}
      onClose={() => setOpenBooking(null)}
    />
  ) : freeSelected.length > 0 ? (
    <div className="flex flex-col gap-4">
      {releasedSelected.map((pass) => (
        <ReleasedDay key={pass.bookingId} pass={pass} date={date} />
      ))}
      <NewBookingForm
        key={date}
        areaName={areaName}
        date={date}
        spots={freeSelected}
        seasons={seasons}
        onRemove={(id) => setSelected((current) => current.filter((s) => s.id !== id))}
        onDone={() => setSelected([])}
      />
    </div>
  ) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0">
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
