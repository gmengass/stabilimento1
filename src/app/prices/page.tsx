import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageMain } from "@/components/page-main";
import { getDb } from "@/db/client";
import { formatCents, venueToday } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { listSeasons, loadOpenSeason } from "@/lib/booking/seasons";
import { listPrices } from "@/lib/pricing/price-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("prices");
  return { title: t("title") };
}

/** The season whose prices staff quote: today's or the next one, else the latest. */
async function seasonToShow() {
  const open = await loadOpenSeason(getDb(), venueToday());
  if (open) return { id: open.id, name: open.name };
  const latest = (await listSeasons(getDb()))[0];
  return latest ? { id: latest.id, name: latest.name } : null;
}

/**
 * The price list for everyone signed in (ADR 0029), drawn from the stored prices so it always
 * matches the suggested price. Outside the app's nav so it fills a tablet screen.
 */
export default async function PricesPage() {
  await requireUser();
  const t = await getTranslations("prices");
  const locale = await getLocale();
  const season = await seasonToShow();
  const entries = season ? await listPrices(getDb(), season.id) : [];
  return (
    <PageMain className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {season ? t("heading", { name: season.name }) : t("title")}
        </h1>
        <Link
          href="/"
          className="flex min-h-11 items-center rounded border px-4 py-2 text-base font-semibold"
        >
          {t("close")}
        </Link>
      </div>
      {!season && <p>{t("noSeason")}</p>}
      {season && entries.length === 0 && <p>{t("empty")}</p>}
      {entries.length > 0 && (
        <>
          <table className="w-full border-collapse text-lg tabular-nums">
            <thead>
              <tr className="border-b-2">
                <th scope="col" className="p-2 text-left">
                  {t("days")}
                </th>
                <th scope="col" className="p-2 text-right">
                  {t("single")}
                </th>
                <th scope="col" className="p-2 text-right">
                  {t("bundle")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.days ?? "season"}
                  className={entry.days === null ? "border-t-2 font-semibold" : "border-b"}
                >
                  <th scope="row" className="p-2 text-left font-normal">
                    {entry.days === null ? t("season") : entry.days}
                  </th>
                  <td className="p-2 text-right">{formatCents(entry.single, locale)}</td>
                  <td className="p-2 text-right">{formatCents(entry.bundle, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-gray-700 dark:text-gray-300">{t("piecesNote")}</p>
        </>
      )}
    </PageMain>
  );
}
