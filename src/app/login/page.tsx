import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations("login");
  return (
    <>
      <header className="flex justify-end p-4">
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <LoginForm />
      </main>
    </>
  );
}
