"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type ChangeEvent } from "react";
import { setTheme } from "@/theme/actions";
import { themes, type Theme } from "@/theme/config";

interface Props {
  /** The theme the server rendered with, from the `theme` cookie. */
  current: Theme;
}

export function ThemeSwitcher({ current }: Props) {
  const t = useTranslations("common.themeSwitcher");
  const [value, setValue] = useState<Theme>(current);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function show(theme: Theme) {
    setValue(theme);
    document.documentElement.dataset.theme = theme;
  }

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const previous = value;
    const next = event.target.value as Theme;
    // Repaint now; the Server Action saves the cookie and re-renders `<html data-theme>` to match.
    show(next);
    startTransition(async () => {
      const saved = await setTheme(next).catch(() => ({ ok: false }));
      if (!saved.ok) show(previous);
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id}>{t("label")}</label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        disabled={pending}
        className="bg-background min-h-11 rounded border px-3 py-2"
      >
        {themes.map((theme) => (
          <option key={theme} value={theme}>
            {t(theme)}
          </option>
        ))}
      </select>
    </div>
  );
}
