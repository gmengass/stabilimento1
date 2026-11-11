import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <label className="flex flex-col gap-1 text-sm">
        {t("noteLabel")}
        <input data-testid="i18n-probe" className="rounded border px-2 py-1" />
      </label>
    </main>
  );
}
