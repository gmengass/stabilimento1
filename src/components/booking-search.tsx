import { getTranslations } from "next-intl/server";
import { SearchIcon } from "./icons";

interface Props {
  /** The day and space being viewed: results open there when the booking holds that day. */
  date: string;
  areaId?: number;
  query?: string;
}

/** A plain GET form to `/search`, so it works without JavaScript and Back returns to it. */
export async function BookingSearch({ date, areaId, query }: Props) {
  const t = await getTranslations("search");
  return (
    <form action="/search" role="search" className="flex w-full max-w-md gap-2">
      <input type="hidden" name="date" value={date} />
      {areaId ? <input type="hidden" name="area" value={areaId} /> : null}
      <input
        type="search"
        name="q"
        defaultValue={query}
        aria-label={t("label")}
        placeholder={t("placeholder")}
        maxLength={60}
        autoComplete="off"
        className="min-h-11 min-w-0 flex-1 rounded border px-3"
      />
      <button
        type="submit"
        title={t("submit")}
        className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded border"
      >
        <SearchIcon />
        <span className="sr-only">{t("submit")}</span>
      </button>
    </form>
  );
}
