import { useTranslations } from "next-intl";
import type { MapLine } from "@/lib/beach/layout";

/**
 * The beach drawn as staff stand facing the sea (ADR 0004): sea at the top, line 1 nearest to
 * it, position 1 on the left. Each spot sits in the grid column of its position, so gaps on the
 * real beach stay visible.
 */
export function BeachMap({ lines }: { lines: MapLine[] }) {
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
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(2.75rem, 1fr))` }}
            >
              {line.spots.map((spot) => (
                <li
                  key={spot.id}
                  style={{ gridColumn: spot.position }}
                  aria-label={t("spotFree", { number: spot.number })}
                  className="flex h-11 items-center justify-center rounded border border-green-600 bg-green-50 text-sm font-semibold text-green-900"
                >
                  {spot.number}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
