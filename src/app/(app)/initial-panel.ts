import type { MapLine, MapSpot } from "@/lib/beach/layout";
import type { Occupant } from "@/lib/booking/bookings";

export interface InitialPanel {
  openBooking: number | null;
  selected: MapSpot[];
}

/**
 * What the map opens with for a booking asked for in the URL (from search): its panel if it is
 * on the map this day, else its no-show umbrellas nobody rebooked (their restore box), else nothing.
 */
export function initialPanel(
  lines: MapLine[],
  occupancy: Record<number, Occupant>,
  noShows: Record<number, Occupant>,
  bookingId: number | null,
): InitialPanel {
  if (bookingId === null) return { openBooking: null, selected: [] };
  if (Object.values(occupancy).some((o) => o.bookingId === bookingId))
    return { openBooking: bookingId, selected: [] };
  const selected = lines
    .flatMap((line) => line.spots)
    .filter((s) => noShows[s.id]?.bookingId === bookingId && !occupancy[s.id]);
  return { openBooking: null, selected };
}
