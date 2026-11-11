import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";

export default async function Home() {
  await requireUser();
  const t = await getTranslations("home");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
    </main>
  );
}
