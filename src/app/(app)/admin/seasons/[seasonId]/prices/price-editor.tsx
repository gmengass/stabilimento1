"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { centsToInput, parseEuros } from "@/lib/pricing/money";
import type { PriceEntry } from "@/lib/pricing/price-list";
import { LIST_DAYS } from "@/lib/pricing/suggest";
import { savePricesAction } from "../../actions";
import { ownWrite } from "@/lib/live/own-write";

type Feedback =
  | { kind: "saved" }
  | { kind: "rows"; rows: string }
  | { kind: "error"; key: "invalid" | "notFound" | "forbidden" | "generic" }
  | null;

const ROWS: (number | null)[] = [...Array.from({ length: LIST_DAYS }, (_, i) => i + 1), null];

const keyOf = (days: number | null) => (days === null ? "season" : String(days));

const field = "w-full rounded border px-2 py-2 text-right tabular-nums";

/** Reads the form: complete rows, and the rows that are half filled or not a price. */
function readRows(form: FormData) {
  const rows: PriceEntry[] = [];
  const bad: string[] = [];
  for (const days of ROWS) {
    const key = keyOf(days);
    const single = parseEuros(String(form.get(`single-${key}`) ?? ""));
    const bundle = parseEuros(String(form.get(`bundle-${key}`) ?? ""));
    if (single === "blank" && bundle === "blank") continue;
    if (typeof single === "number" && typeof bundle === "number") {
      rows.push({ days, single, bundle });
    } else {
      bad.push(key);
    }
  }
  return { rows, bad };
}

export function PriceEditor({ seasonId, entries }: { seasonId: number; entries: PriceEntry[] }) {
  const t = useTranslations("prices");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const byKey = new Map(entries.map((e) => [keyOf(e.days), e]));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { rows, bad } = readRows(new FormData(event.currentTarget));
    if (bad.length > 0) {
      const names = bad.map((key) => (key === "season" ? t("season") : key));
      setFeedback({ kind: "rows", rows: names.join(", ") });
      return;
    }
    startTransition(async () => {
      try {
        const result = await ownWrite(() => savePricesAction({ seasonId, rows }));
        setFeedback(result.ok ? { kind: "saved" } : { kind: "error", key: result.error });
      } catch {
        setFeedback({ kind: "error", key: "generic" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className="p-2 text-left">
              {t("days")}
            </th>
            <th scope="col" className="p-2 text-right">
              {t("single")}
            </th>
            <th scope="col" className="p-2 text-right">
              {t("bundle")}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((days) => {
            const key = keyOf(days);
            const entry = byKey.get(key);
            const label = days === null ? t("season") : t("daysRow", { count: days });
            return (
              <tr key={key} className="border-b">
                <th scope="row" className="p-2 text-left font-normal">
                  {label}
                </th>
                <td className="p-1">
                  <input
                    name={`single-${key}`}
                    inputMode="decimal"
                    aria-label={t("admin.singleFor", { row: label })}
                    defaultValue={entry ? centsToInput(entry.single) : ""}
                    className={field}
                  />
                </td>
                <td className="p-1">
                  <input
                    name={`bundle-${key}`}
                    inputMode="decimal"
                    aria-label={t("admin.bundleFor", { row: label })}
                    defaultValue={entry ? centsToInput(entry.bundle) : ""}
                    className={field}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-sm text-gray-700 dark:text-gray-300">{t("admin.hint")}</p>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {t("admin.save")}
      </button>
      {feedback?.kind === "saved" && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {t("admin.saved")}
        </p>
      )}
      {feedback?.kind === "rows" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t("admin.badRows", { rows: feedback.rows })}
        </p>
      )}
      {feedback?.kind === "error" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(`admin.errors.${feedback.key}`)}
        </p>
      )}
    </form>
  );
}
