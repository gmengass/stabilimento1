import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("body")}</p>
    </main>
  );
}
