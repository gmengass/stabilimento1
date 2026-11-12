"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { MAX_LINES, MAX_UMBRELLAS_PER_LINE } from "@/lib/beach/limits";
import { setupBeachAction } from "./actions";

type ErrorKey = "invalid" | "exists" | "forbidden" | "generic";

const field = "rounded border px-2 py-1";

export function BeachSetupForm() {
  const t = useTranslations("beachSetup");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    startTransition(async () => {
      try {
        const result = await setupBeachAction(input);
        if (result.ok) router.push("/");
        else setError(result.error);
      } catch {
        setError("generic");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("venueName")}
        <input name="venueName" required maxLength={100} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("areaName")}
        <input
          name="areaName"
          required
          maxLength={100}
          defaultValue={t("areaNameDefault")}
          className={field}
        />
        <span className="text-gray-600">{t("areaNameHint")}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("lines")}
        <input
          name="lines"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_LINES}
          defaultValue={6}
          required
          className={field}
        />
        <span className="text-gray-600">{t("linesHint")}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("umbrellasPerLine")}
        <input
          name="umbrellasPerLine"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_UMBRELLAS_PER_LINE}
          defaultValue={18}
          required
          className={field}
        />
        <span className="text-gray-600">{t("numberingHint")}</span>
      </label>
      <button type="submit" disabled={pending} className="rounded border px-3 py-2">
        {pending ? t("submitting") : t("submit")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`errors.${error}`)}
        </p>
      )}
    </form>
  );
}
