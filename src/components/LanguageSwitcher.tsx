"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { locales, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

export function LanguageSwitcher() {
  const t = useTranslations("languageSwitcher");
  const active = useLocale();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    startTransition(() => setLocale(locale));
  }

  return (
    <div role="group" aria-label={t("label")} className="flex gap-1 text-sm">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === active}
          disabled={pending}
          onClick={() => choose(locale)}
          className="rounded px-2 py-1 aria-pressed:font-semibold aria-pressed:underline disabled:opacity-50"
        >
          {t(locale)}
        </button>
      ))}
    </div>
  );
}
