import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { loadBeach } from "@/lib/beach/layout";
import { LayoutEditor } from "./layout-editor";
import { BeachSetupForm } from "./setup-form";

export default async function BeachSetupPage() {
  await requireAdmin();
  const t = await getTranslations("beachSetup");
  const beach = await loadBeach(getDb());
  const umbrellas = beach?.lines.reduce((sum, line) => sum + line.spots.length, 0) ?? 0;
  if (beach) {
    return (
      <main className="flex w-full flex-col gap-6 p-4">
        <div className="flex flex-wrap items-baseline gap-4">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-gray-600">
            {t("summary", { name: beach.venueName, lines: beach.lines.length, umbrellas })}
          </p>
          <Link href="/" className="ml-auto underline">
            {t("openMap")}
          </Link>
        </div>
        <LayoutEditor beach={beach} />
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
