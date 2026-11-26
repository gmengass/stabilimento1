"use client";

import { useTranslations } from "next-intl";
import type { MapLine, MapSpot } from "@/lib/beach/layout";
import { statusMarkKey, type SpotView } from "@/lib/beach/status-mark";
import { WavesIcon } from "./icons";

export type { SpotView };

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

/**
 * Sun tiles (Arturo and Sera, ADR 0031): solid fills, a near-black outline (light in Sera). The
 * same in both themes, so the colour code stays the same.
 */
const outline = "sun:border-[#111] sun:dark:border-[#e8eef2]";
const sunClass: Record<SpotView, string> = {
  free: `${outline} sun:bg-white sun:text-[#111] sun:dark:bg-[#e8eef2]`,
  released:
    "sun:border-[#5b21b6] sun:bg-white sun:text-[#111] sun:dark:border-[#a78bfa] sun:dark:bg-[#e8eef2]",
  noShow: `${outline} sun:bg-[#ffc300] sun:text-[#111]`,
  selected: `${outline} sun:bg-blue-700 sun:text-white`,
  booked: `${outline} sun:bg-[#c1121f] sun:text-white`,
  checkedIn: `${outline} sun:bg-[#0b6e4f] sun:text-white`,
  season: `${outline} sun:bg-[#5b21b6] sun:text-white`,
  open: "sun:border-[#e8862a] sun:bg-[#7f1d1d] sun:text-white",
};

/** The corner mark takes the tile's text colour, except on a released day's white tile. */
const markClass: Partial<Record<SpotView, string>> = { released: "sun:text-[#5b21b6]" };

const corner = "sun:top-0.5 sun:text-[12px] sun:font-medium";

/** The thick sun outline hides the inset ring, so sun tiles get an outer blue ring (WCAG 2.4.7). */
const sunFocus =
  "sun:focus-visible:z-10 sun:focus-visible:shadow-none sun:focus-visible:outline-[3px] sun:focus-visible:outline-offset-2 sun:focus-visible:outline-[#1d4ed8] sun:dark:focus-visible:outline-[#93c5fd]";

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
  /** Shown large on the sea band, so the space is named right above the umbrellas. */
  areaName: string;
  lines: MapLine[];
  viewOf: (spot: MapSpot) => SpotView;
  /** Short text under the number, e.g. the customer's name. */
  captionOf: (spot: MapSpot) => string | undefined;
  /** A short mark in the corner: a tick, a late-arrival time, a no-show marker. */
  badgeOf?: (spot: MapSpot) => { text: string; label: string } | undefined;
  /** A short mark in the other top corner: sunbeds or deckchairs beyond the default (ADR 0023). */
  extrasOf?: (spot: MapSpot) => { text: string; label: string } | undefined;
  /**
   * `viaKeyboard`: activated with Enter or Space (click `detail` 0), not tapped or clicked. Assistive
   * tech and `element.click()` give detail 0 too; they want the same focus handling.
   */
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
    <div data-testid="beach-map" className="@container overflow-x-auto">
      <div className="inline-flex min-w-full flex-col gap-2">
        {/* As wide as the visible map and pinned left, so a wide map scrolls under its name. */}
        <div
          data-testid="sea-band"
          className="sticky left-0 flex w-[100cqw] self-start items-center justify-center gap-x-2 sm:gap-x-3 rounded bg-sky-200 px-2 py-2 text-sky-900 sun:dark:bg-[#0c3b5e] sun:dark:text-[#bfe3f7]"
        >
          <WavesIcon />
          <span className="text-sm font-semibold tracking-widest uppercase">{t("sea")}</span>
          <span className="min-w-0 truncate text-xl font-bold sm:text-3xl">{areaName}</span>
          <WavesIcon />
        </div>
        {lines.map((line) => (
          <section key={line.number} aria-label={t("line", { number: line.number })}>
            <h2 className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
              {t("line", { number: line.number })}
            </h2>
            <ol
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(var(--tile-min), 1fr))` }}
            >
              {line.spots.map((spot) => {
                const view = viewOf(spot);
                const caption = captionOf(spot);
                const badge = badgeOf?.(spot);
                const extras = extrasOf?.(spot);
                const mark = badge ? undefined : statusMarkKey(view);
                return (
                  <li key={spot.id} style={{ gridColumn: spot.position }}>
                    <button
                      type="button"
                      data-spot-id={spot.id}
                      onClick={(event) => onSpotClick(spot, event.detail === 0)}
                      aria-pressed={view === "selected" || view === "open"}
                      className={`relative flex h-14 focus-visible:outline-black focus-visible:outline-offset-[-2px] focus-visible:shadow-[inset_0_0_0_2px_#fff] w-full flex-col items-center justify-center rounded border text-sm font-semibold sun:h-[4.5rem] sun:rounded-lg sun:border-[3px] sun:text-[18px] sun:font-medium ${sunFocus} ${viewClass[view]} ${sunClass[view]}`}
                    >
                      <span aria-hidden>{spot.number}</span>
                      {caption && (
                        <span
                          aria-hidden
                          className="max-w-full truncate px-0.5 text-[10px] font-normal sun:mt-1 sun:px-1 sun:text-[14px] sun:leading-tight"
                        >
                          {caption}
                        </span>
                      )}
                      {badge && (
                        <span
                          aria-hidden
                          data-testid="tile-badge"
                          className={`absolute top-0 right-0.5 text-[10px] leading-tight font-normal sun:right-1 ${corner}`}
                        >
                          {badge.text}
                        </span>
                      )}
                      {mark && (
                        <span
                          aria-hidden
                          data-testid="tile-mark"
                          className={`absolute right-1 hidden leading-tight sun:block ${corner} ${markClass[view] ?? ""}`}
                        >
                          {t(mark)}
                        </span>
                      )}
                      {extras && (
                        <span
                          aria-hidden
                          data-testid="tile-extras"
                          className={`absolute top-0 left-0.5 text-[10px] leading-tight font-normal sun:left-1 ${corner}`}
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
