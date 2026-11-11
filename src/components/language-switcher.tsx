"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useTransition, type ChangeEvent } from "react";
import { locales } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

export function LanguageSwitcher() {
  const t = useTranslations("common.languageSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = useId();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    startTransition(async () => {
      const result = await setLocale(next);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id}>{t("label")}</label>
      <select
        id={id}
        value={locale}
        onChange={onChange}
        disabled={pending}
        className="rounded border px-2 py-1"
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </select>
    </div>
  );
}
