import { getLocale, getTranslations } from "next-intl/server";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatBookingDate, formatTimestamp } from "@/i18n/format";
import { mayUndo, type ActivityEntry, type Viewer } from "@/lib/booking/audit";
import { UndoButton } from "./undo-button";

interface Props {
  entries: ActivityEntry[];
  viewer: Viewer;
}

/** The latest actions for the whole venue, with Undo where this viewer may use it (ADR 0013). */
export async function ActivityPanel({ entries, viewer }: Props) {
  const t = await getTranslations("activity");
  const requested = await getLocale();
  const locale = isLocale(requested) ? requested : defaultLocale;
  const now = new Date();
  const day = (date: unknown) => formatBookingDate(String(date), locale);
  const range = (from: unknown, to: unknown) =>
    from === to ? day(from) : t("range", { from: day(from), to: day(to) });

  function describe(entry: ActivityEntry): string {
    const user = entry.userName ?? t("system");
    const name = entry.customerName ?? "";
    const spots = t("spots", { count: entry.spots.length, numbers: entry.spots.join(", ") });
    const { detail } = entry;
    switch (entry.action) {
      case "book": {
        const text =
          entry.kind === "season"
            ? t("sellPass", { user, spots, name, from: day(entry.startDate) })
            : t("book", { user, spots, name, dates: range(entry.startDate, entry.endDate) });
        const deckchairs = Number(detail.deckchairs ?? 0);
        return deckchairs > 0 ? t("withDeckchairs", { text, count: deckchairs }) : text;
      }
      case "cancel":
        return t("cancel", { user, name, spots });
      case "set_last_day":
        return t("setLastDay", { user, name, date: day(detail.lastDay) });
      case "restore":
        if (detail.from === "no_show") {
          return t("restoreNoShow", { user, name, spots });
        }
        return t("restore", {
          user,
          name,
          days: Number(detail.days),
          dates: range(detail.startDate, detail.endDate),
        });
      case "release":
        return t(entry.action, {
          user,
          name,
          days: Number(detail.days),
          dates: range(detail.startDate, detail.endDate),
        });
      case "move": {
        const list = (numbers: unknown) =>
          t("spots", { count: String(numbers).split(",").length, numbers: String(numbers) });
        return t("move", {
          user,
          name,
          fromSpots: list(detail.fromSpots),
          toSpots: list(detail.toSpots),
          // Same dates: only the umbrellas moved, from `fromDay` on.
          dates:
            detail.fromStart === detail.toStart && detail.fromEnd === detail.toEnd
              ? range(detail.fromDay, detail.toEnd)
              : range(detail.toStart, detail.toEnd),
        });
      }
      case "check_in":
      case "uncheck":
        return t(entry.action === "check_in" ? "checkIn" : "uncheck", { user, name, spots });
      case "hold":
        return detail.holdUntil
          ? t("hold", { user, name, time: String(detail.holdUntil) })
          : t("holdCleared", { user, name });
      case "no_show":
        return t("noShow", {
          bookings: Number(detail.bookings),
          umbrellas: Number(detail.umbrellas),
        });
      case "undo":
        return t("undo", { user, name, spots, action: entry.undoesAction ?? "other" });
      case "beach":
        return detail.what === "setDefaultHold" && detail.to
          ? t("beachHold", { user, from: String(detail.from), to: String(detail.to) })
          : t("beach", { user });
      case "season":
        return t("season", { user, what: String(detail.what) });
    }
  }

  return (
    // Native disclosure: works without client code, and a re-render after an undo keeps the
    // state the staff member chose, because React only sets `open` when the prop changes.
    <details open data-testid="activity" className="rounded border p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold">{t("title")}</summary>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t("empty")}</p>
      ) : (
        <ol className="mt-2 flex flex-col divide-y">
          {entries.map((entry) => {
            const text = describe(entry);
            return (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                <time
                  dateTime={entry.at.toISOString()}
                  className="text-gray-600 dark:text-gray-400 tabular-nums"
                >
                  {formatTimestamp(entry.at, locale)}
                </time>
                <span
                  className={
                    entry.undone ? "flex-1 text-gray-500 dark:text-gray-400 line-through" : "flex-1"
                  }
                >
                  {text}
                </span>
                {entry.undone ? (
                  <span className="text-gray-600 dark:text-gray-400">{t("undone")}</span>
                ) : (
                  mayUndo(entry, viewer, now) && (
                    <UndoButton entryId={entry.id} label={t("undoLabel", { text })} />
                  )
                )}
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}
