import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AreaBanner, AreaTabs } from "@/components/area-tabs";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { listAreas, loadBeach, parseAreaId } from "@/lib/beach/layout";
import { AddAreaForm, CurrentAreaForm } from "./area-forms";
import { LayoutEditor, VenueNameForm } from "./layout-editor";
import { BeachSetupForm } from "./setup-form";

export default async function BeachSetupPage(props: PageProps<"/admin/beach">) {
  await requireAdmin();
  const t = await getTranslations("beachSetup");
  const { area } = await props.searchParams;
  const beach = await loadBeach(getDb(), parseAreaId(area));
  if (beach) {
    const areas = await listAreas(getDb());
    return (
      <main className="flex w-full flex-col gap-6 p-4">
        <div className="flex flex-wrap items-baseline gap-4">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-gray-600">
            {t("summary", { name: beach.venueName, areas: areas.length })}
          </p>
          <Link href={`/?area=${beach.areaId}`} className="ml-auto underline">
            {t("openMap")}
          </Link>
        </div>
        <VenueNameForm name={beach.venueName} />
        <section className="flex flex-col gap-4 rounded border border-sky-800 p-4">
          <AreaTabs
            areas={areas}
            currentId={beach.areaId}
            hrefOf={Object.fromEntries(areas.map((a) => [a.id, `/admin/beach?area=${a.id}`]))}
          />
          <AreaBanner name={beach.areaName} />
          <div key={beach.areaId} className="flex flex-col gap-4">
            <CurrentAreaForm areaId={beach.areaId} name={beach.areaName} />
            <LayoutEditor beach={beach} />
          </div>
        </section>
        <AddAreaForm />
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("intro")}</p>
      <BeachSetupForm />
    </main>
  );
}
