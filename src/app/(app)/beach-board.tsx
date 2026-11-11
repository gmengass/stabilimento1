"use client";

import { useState } from "react";
import { BeachMap, type SpotView } from "@/components/beach-map";
import type { MapLine, MapSpot } from "@/lib/beach/layout";
import type { Occupant } from "@/lib/booking/bookings";
import { BookingDetails, NewBookingForm } from "./booking-panel";

interface Props {
  date: string;
  lines: MapLine[];
  occupancy: Record<number, Occupant>;
}

/** The map plus its side panel: pick free umbrellas to book, or tap a booked one to see it. */
export function BeachBoard({ date, lines, occupancy }: Props) {
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
    if (occupant) return occupant.bookingId === openBooking ? "open" : "booked";
    return freeSelected.some((s) => s.id === spot.id) ? "selected" : "free";
  }

  const panel = open ? (
    <BookingDetails key={open.bookingId} occupant={open} onClose={() => setOpenBooking(null)} />
  ) : freeSelected.length > 0 ? (
    <NewBookingForm
      key={date}
      date={date}
      spots={freeSelected}
      onRemove={(id) => setSelected((current) => current.filter((s) => s.id !== id))}
      onDone={() => setSelected([])}
    />
  ) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0">
        <BeachMap
          lines={lines}
          viewOf={viewOf}
          captionOf={(spot) => occupancy[spot.id]?.customerName}
          onSpotClick={onSpotClick}
        />
      </div>
      {panel && <aside className="rounded border p-4 lg:sticky lg:top-4">{panel}</aside>}
    </div>
  );
}
