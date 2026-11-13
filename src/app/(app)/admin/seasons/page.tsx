import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { listSeasons } from "@/lib/booking/seasons";
import { NewSeasonForm, SeasonCard } from "./season-forms";

export default async function SeasonsPage() {
  await requireAdmin();
  const t = await getTranslations("seasons");
  const seasons = await listSeasons(getDb());
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-gray-700">{t("intro")}</p>
      {seasons.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {seasons.map((season) => (
            <li key={season.id}>
              <SeasonCard season={season} />
            </li>
          ))}
        </ul>
      )}
      <NewSeasonForm />
    </main>
  );
}
