"use client";

import { useTranslations } from "next-intl";
import type { MapLine, MapSpot } from "@/lib/beach/layout";

export type SpotView =
  "free" | "released" | "noShow" | "selected" | "booked" | "checkedIn" | "season" | "open";

const viewClass: Record<SpotView, string> = {
  free: "border-green-600 bg-green-50 text-green-900",
  released: "border-dashed border-violet-700 bg-green-50 text-green-900",
  noShow: "border-dashed border-amber-600 bg-amber-50 text-amber-950",
  selected: "border-blue-700 bg-blue-600 text-white",
  booked: "border-red-700 bg-red-100 text-red-950",
  checkedIn: "border-teal-800 bg-teal-100 text-teal-950",
  season: "border-violet-700 bg-violet-100 text-violet-950",
  open: "border-red-900 bg-red-700 text-white",
};

/** Screen-reader text per view. A selected spot is a free one being picked. */
const labelKey = {
  free: "spotFree",
  released: "spotReleased",
  noShow: "spotNoShow",
  selected: "spotFree",
  booked: "spotBooked",
  checkedIn: "spotCheckedIn",
  season: "spotSeason",
  open: "spotBooked",
} as const satisfies Record<SpotView, string>;

interface Props {
  /** Shown on the sea band, so the space is named right above the umbrellas. */
  areaName: string;
  lines: MapLine[];
  viewOf: (spot: MapSpot) => SpotView;
  /** Short text under the number, e.g. the customer's name. */
  captionOf: (spot: MapSpot) => string | undefined;
  /** A short mark in the corner: a tick, a late-arrival time, a no-show marker. */
  badgeOf?: (spot: MapSpot) => { text: string; label: string } | undefined;
  /** A short mark in the other top corner: sunbeds or deckchairs beyond the default (ADR 0023). */
  extrasOf?: (spot: MapSpot) => { text: string; label: string } | undefined;
  /** `viaKeyboard`: the tile was activated with Enter or Space, not tapped or clicked. */
  onSpotClick: (spot: MapSpot, viaKeyboard: boolean) => void;
}

/**
 * The beach drawn as staff stand facing the sea (ADR 0004): sea at the top, line 1 nearest to
 * it, position 1 on the left. Each spot sits in the grid column of its position, so gaps on the
 * real beach stay visible.
 */
export function BeachMap({
  areaName,
  lines,
  viewOf,
  captionOf,
  badgeOf,
  extrasOf,
  onSpotClick,
}: Props) {
  const t = useTranslations("map");
  const columns = Math.max(1, ...lines.flatMap((line) => line.spots.map((s) => s.position)));
  return (
    <div data-testid="beach-map" className="overflow-x-auto">
      <div className="inline-flex min-w-full flex-col gap-2">
        <div className="rounded bg-sky-200 py-2 text-center text-sm font-medium text-sky-900">
          {t("seaOf", { area: areaName })}
        </div>
        {lines.map((line) => (
          <section key={line.number} aria-label={t("line", { number: line.number })}>
            <h2 className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
              {t("line", { number: line.number })}
            </h2>
            <ol
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(3.25rem, 1fr))` }}
            >
              {line.spots.map((spot) => {
                const view = viewOf(spot);
                const caption = captionOf(spot);
                const badge = badgeOf?.(spot);
                const extras = extrasOf?.(spot);
                return (
                  <li key={spot.id} style={{ gridColumn: spot.position }}>
                    <button
                      type="button"
                      data-spot-id={spot.id}
                      onClick={(event) => onSpotClick(spot, event.detail === 0)}
                      aria-pressed={view === "selected" || view === "open"}
                      className={`relative flex h-14 focus-visible:outline-black focus-visible:outline-offset-[-2px] focus-visible:shadow-[inset_0_0_0_2px_#fff] w-full flex-col items-center justify-center rounded border text-sm font-semibold ${viewClass[view]}`}
                    >
                      <span aria-hidden>{spot.number}</span>
                      {caption && (
                        <span
                          aria-hidden
                          className="max-w-full truncate px-0.5 text-[10px] font-normal"
                        >
                          {caption}
                        </span>
                      )}
                      {badge && (
                        <span
                          aria-hidden
                          className="absolute top-0 right-0.5 text-[10px] leading-tight font-normal"
                        >
                          {badge.text}
                        </span>
                      )}
                      {extras && (
                        <span
                          aria-hidden
                          data-testid="tile-extras"
                          className="absolute top-0 left-0.5 text-[10px] leading-tight font-normal"
                        >
                          {extras.text}
                        </span>
                      )}
                      <span className="sr-only">
                        {t(labelKey[view], { number: spot.number, name: caption ?? "" })}
                        {badge && <span> {badge.label}</span>}
                        {extras && <span> {extras.label}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
