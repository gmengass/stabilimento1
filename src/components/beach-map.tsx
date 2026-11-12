"use client";

import { useTranslations } from "next-intl";
import type { MapLine, MapSpot } from "@/lib/beach/layout";

export type SpotView = "free" | "selected" | "booked" | "open";

const viewClass: Record<SpotView, string> = {
  free: "border-green-600 bg-green-50 text-green-900",
  selected: "border-blue-700 bg-blue-600 text-white",
  booked: "border-red-700 bg-red-100 text-red-950",
  open: "border-red-900 bg-red-700 text-white",
};

interface Props {
  lines: MapLine[];
  viewOf: (spot: MapSpot) => SpotView;
  /** Short text under the number, e.g. the customer's name. */
  captionOf: (spot: MapSpot) => string | undefined;
  onSpotClick: (spot: MapSpot) => void;
}

/**
 * The beach drawn as staff stand facing the sea (ADR 0004): sea at the top, line 1 nearest to
 * it, position 1 on the left. Each spot sits in the grid column of its position, so gaps on the
 * real beach stay visible.
 */
export function BeachMap({ lines, viewOf, captionOf, onSpotClick }: Props) {
  const t = useTranslations("map");
  const columns = Math.max(1, ...lines.flatMap((line) => line.spots.map((s) => s.position)));
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full flex-col gap-2">
        <div className="rounded bg-sky-200 py-2 text-center text-sm font-medium text-sky-900">
          {t("sea")}
        </div>
        {lines.map((line) => (
          <section key={line.number} aria-label={t("line", { number: line.number })}>
            <h2 className="mb-1 text-xs font-medium text-gray-600">
              {t("line", { number: line.number })}
            </h2>
            <ol
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(3.25rem, 1fr))` }}
            >
              {line.spots.map((spot) => {
                const view = viewOf(spot);
                const caption = captionOf(spot);
                const free = view === "free" || view === "selected";
                return (
                  <li key={spot.id} style={{ gridColumn: spot.position }}>
                    <button
                      type="button"
                      onClick={() => onSpotClick(spot)}
                      aria-pressed={view === "selected" || view === "open"}
                      className={`relative flex h-14 w-full flex-col items-center justify-center rounded border text-sm font-semibold ${viewClass[view]}`}
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
                      <span className="sr-only">
                        {free
                          ? t("spotFree", { number: spot.number })
                          : t("spotBooked", { number: spot.number, name: caption ?? "" })}
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
