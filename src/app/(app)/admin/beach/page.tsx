import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AreaBanner, AreaTabs } from "@/components/area-tabs";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { listAreas, loadBeach, parseAreaId } from "@/lib/beach/layout";
import { AddAreaForm, CurrentAreaForm } from "./area-forms";
import { DefaultHoldForm, LayoutEditor, StockForm, VenueNameForm } from "./layout-editor";
import { PageMain } from "@/components/page-main";
import { BeachSetupForm } from "./setup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("beachSetup");
  return { title: t("title") };
}

export default async function BeachSetupPage(props: PageProps<"/admin/beach">) {
  await requireAdmin();
  const t = await getTranslations("beachSetup");
  const { area } = await props.searchParams;
  const requestedArea = parseAreaId(area);
  const beach = await loadBeach(getDb(), requestedArea);
  if (beach && area !== undefined && beach.areaId !== requestedArea) {
    redirect(`/admin/beach?area=${beach.areaId}`);
  }
  if (beach) {
    const areas = await listAreas(getDb());
    return (
      <PageMain className="flex w-full flex-col gap-6 p-4">
        <div className="flex flex-wrap items-baseline gap-4">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("summary", { name: beach.venueName, areas: areas.length })}
          </p>
          <Link
            href={`/?area=${beach.areaId}`}
            className="ml-auto inline-flex min-h-11 items-center underline"
          >
            {t("openMap")}
          </Link>
        </div>
        <VenueNameForm name={beach.venueName} />
        <DefaultHoldForm time={beach.defaultHoldUntil} />
        <section className="flex flex-col gap-4 rounded border border-sky-800 dark:border-sky-400 p-4">
          <AreaTabs
            areas={areas}
            currentId={beach.areaId}
            hrefOf={Object.fromEntries(areas.map((a) => [a.id, `/admin/beach?area=${a.id}`]))}
          />
          <AreaBanner name={beach.areaName} />
          <div key={beach.areaId} className="flex flex-col gap-4">
            <CurrentAreaForm areaId={beach.areaId} name={beach.areaName} />
            <StockForm
              areaId={beach.areaId}
              sunbeds={beach.sunbedStock}
              deckchairs={beach.deckchairStock}
            />
            <LayoutEditor beach={beach} />
          </div>
        </section>
        <AddAreaForm key={beach.areaId} />
      </PageMain>
    );
  }
  return (
    <PageMain className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("intro")}</p>
      <BeachSetupForm />
    </PageMain>
  );
}
