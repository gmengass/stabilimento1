import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageMain } from "@/components/page-main";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { listSeasons } from "@/lib/booking/seasons";
import { listPrices, previousPrices } from "@/lib/pricing/price-list";
import { PriceEditor } from "./price-editor";
import { LiveNotice } from "@/components/live-notice";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("prices.admin");
  return { title: t("title") };
}

export default async function SeasonPricesPage(
  props: PageProps<"/admin/seasons/[seasonId]/prices">,
) {
  await requireAdmin();
  const t = await getTranslations("prices.admin");
  const { seasonId: raw } = await props.params;
  const seasonId = /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
  const season = (await listSeasons(getDb())).find((s) => s.id === seasonId);
  if (!season) notFound();
  const entries = await listPrices(getDb(), season.id);
  const source = entries.length === 0 ? await previousPrices(getDb(), season.id) : null;
  return (
    <PageMain className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <LiveNotice kind="setup" />
      <Link href="/admin/seasons" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("heading", { name: season.name })}</h1>
      <p className="text-sm text-gray-700 dark:text-gray-300">{t("intro")}</p>
      {source && (
        <p role="status" className="rounded border p-3 text-sm">
          {t("copied", { name: source.seasonName })}
        </p>
      )}
      <PriceEditor seasonId={season.id} entries={source?.entries ?? entries} />
    </PageMain>
  );
}
