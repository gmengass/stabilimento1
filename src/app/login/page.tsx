import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ClubLogo } from "@/components/club-logo";
import { getCurrentUser } from "@/lib/auth/session";
import { getBranding } from "@/lib/branding";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations("login");
  const branding = await getBranding();
  return (
    <>
      <header className="flex justify-end p-4">
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <ClubLogo branding={branding} backdrop="page" className="h-44 w-auto" />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <LoginForm />
      </main>
    </>
  );
}
