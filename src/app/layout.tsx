import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import "./globals.css";

/** Reads the locale cookie outside Suspense; fine while metadata is dynamic, revisit before "use cache". */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("title"), description: t("description") };
}

/** The locale comes from a cookie (ADR 0005), so the document streams at request time. */
async function LocalizedDocument({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <header className="flex justify-end p-4">
            <LanguageSwitcher />
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense>
      <LocalizedDocument>{children}</LocalizedDocument>
    </Suspense>
  );
}
