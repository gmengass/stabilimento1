"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import type { SeasonError, SeasonResult, SeasonRow } from "@/lib/booking/seasons";
import { createSeasonAction, removeSeasonAction, updateSeasonAction } from "./actions";

type ActionResult = SeasonResult | { ok: false; error: "forbidden" };
type Done = "saved" | "added";
type Feedback =
  | { kind: "done"; key: Done }
  | { kind: "error"; key: SeasonError | "forbidden" | "generic" }
  | null;

function useSeasonAction() {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  function submit(call: () => Promise<ActionResult>, done: Done, onDone?: () => void) {
    startTransition(async () => {
      try {
        const result = await call();
        setFeedback(result.ok ? { kind: "done", key: done } : { kind: "error", key: result.error });
        if (result.ok) onDone?.();
      } catch {
        setFeedback({ kind: "error", key: "generic" });
      }
    });
  }

  return { pending, feedback, submit };
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  const t = useTranslations("seasons");
  if (!feedback) return null;
  if (feedback.kind === "done") {
    return (
      <p role="status" className="text-sm text-green-700">
        {t(feedback.key)}
      </p>
    );
  }
  return (
    <p role="alert" className="text-sm text-red-700">
      {t(`errors.${feedback.key}`)}
    </p>
  );
}

const field = "rounded border px-2 py-2";

interface FieldsProps {
  season?: SeasonRow;
  /** Passes were sold: the dates are shown but can't change. */
  datesFixed?: boolean;
}

function SeasonFields({ season, datesFixed = false }: FieldsProps) {
  const t = useTranslations("seasons");
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        {t("name")}
        <input name="name" required maxLength={60} defaultValue={season?.name} className={field} />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("startDate")}
          <input
            name="startDate"
            type="date"
            required
            readOnly={datesFixed}
            defaultValue={season?.startDate}
            className={field}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("endDate")}
          <input
            name="endDate"
            type="date"
            required
            readOnly={datesFixed}
            defaultValue={season?.endDate}
            className={field}
          />
        </label>
      </div>
    </>
  );
}

export function NewSeasonForm() {
  const t = useTranslations("seasons");
  const { pending, feedback, submit } = useSeasonAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    submit(
      () => createSeasonAction(input),
      "added",
      () => form.reset(),
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border p-4">
      <h2 className="text-lg font-semibold">{t("addTitle")}</h2>
      <SeasonFields />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
      >
        {t("add")}
      </button>
      <FeedbackLine feedback={feedback} />
    </form>
  );
}

export function SeasonCard({ season }: { season: SeasonRow }) {
  const t = useTranslations("seasons");
  const { pending, feedback, submit } = useSeasonAction();
  const [confirming, setConfirming] = useState(false);
  const sold = season.passes > 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    submit(() => updateSeasonAction({ ...input, seasonId: season.id }), "saved");
  }

  function remove() {
    submit(() => removeSeasonAction({ seasonId: season.id }), "saved");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border p-4">
      <SeasonFields season={season} datesFixed={sold} />
      <p className="flex flex-col text-sm text-gray-700">
        <span>{t("passes", { count: season.passes })}</span>
        {sold && <span>{t("datesFixed")}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="rounded border px-3 py-2">
          {t("save")}
        </button>
        {!sold && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded border border-red-700 px-3 py-2 text-red-700"
          >
            {t("remove")}
          </button>
        )}
        {confirming && (
          <>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-60"
            >
              {t("removeYes", { name: season.name })}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border px-3 py-2"
            >
              {t("no")}
            </button>
          </>
        )}
      </div>
      <FeedbackLine feedback={feedback} />
    </form>
  );
}
