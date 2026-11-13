"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { EditError } from "@/lib/beach/edit";
import { MAX_LINES, MAX_UMBRELLAS_PER_LINE } from "@/lib/beach/limits";
import { addAreaAction, removeAreaAction, renameAreaAction } from "./actions";

type ErrorKey = EditError | "forbidden" | "generic";
type Feedback = { ok: true } | { ok: false; error: ErrorKey } | null;

const field = "rounded border px-2 py-2";
const button = "rounded border px-3 py-2 disabled:opacity-60";

function useFeedback() {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  function run<R extends { ok: boolean }>(call: () => Promise<R>, onOk: (result: R) => void) {
    startTransition(async () => {
      try {
        const result = await call();
        if (result.ok) {
          setFeedback({ ok: true });
          onOk(result);
        } else setFeedback(result as unknown as Feedback);
      } catch {
        setFeedback({ ok: false, error: "generic" });
      }
    });
  }
  return { pending, feedback, run };
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  const t = useTranslations("beachSetup");
  if (!feedback) return null;
  return feedback.ok ? (
    <p role="status" className="text-sm text-green-700">
      {t("saved")}
    </p>
  ) : (
    <p role="alert" className="text-sm text-red-700">
      {t(`errors.${feedback.error}`)}
    </p>
  );
}

function input(event: FormEvent<HTMLFormElement>): Record<string, FormDataEntryValue> {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget));
}

/** Rename or remove the beach space being edited. */
export function CurrentAreaForm({ areaId, name }: { areaId: number; name: string }) {
  const t = useTranslations("areas");
  const router = useRouter();
  const { pending, feedback, run } = useFeedback();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) =>
          run(
            () => renameAreaAction({ ...input(e), areaId }),
            () => undefined,
          )
        }
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("name")}
          <input
            key={name}
            name="areaName"
            defaultValue={name}
            required
            maxLength={100}
            className={field}
          />
        </label>
        <button type="submit" disabled={pending} className={button}>
          {t("rename")}
        </button>
        {confirming ? (
          <span className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => removeAreaAction({ areaId }),
                  () => router.push("/admin/beach"),
                )
              }
              className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-60"
            >
              {t("removeYes", { name })}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={button}>
              {t("no")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded border border-red-700 px-3 py-2 text-red-700"
          >
            {t("remove")}
          </button>
        )}
      </form>
      <FeedbackLine feedback={feedback} />
    </div>
  );
}

/** A new beach space with its own lines and umbrellas. Opens it once created. */
export function AddAreaForm() {
  const t = useTranslations("areas");
  const router = useRouter();
  const { pending, feedback, run } = useFeedback();
  return (
    <form
      onSubmit={(e) => {
        const form = e.currentTarget;
        run(
          () => addAreaAction(input(e)),
          (result) => {
            form.reset();
            if ("areaId" in result) router.push(`/admin/beach?area=${result.areaId}`);
          },
        );
      }}
      className="flex flex-col gap-3"
    >
      <h2 className="text-lg font-semibold">{t("addTitle")}</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("name")}
          <input name="areaName" required maxLength={100} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("lines")}
          <input
            name="lines"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_LINES}
            defaultValue={1}
            required
            className={`${field} w-20`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("umbrellasPerLine")}
          <input
            name="umbrellasPerLine"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_UMBRELLAS_PER_LINE}
            defaultValue={10}
            required
            className={`${field} w-20`}
          />
        </label>
        <button type="submit" disabled={pending} className={button}>
          {t("add")}
        </button>
      </div>
      <p className="text-sm text-gray-600">{t("addHint")}</p>
      <FeedbackLine feedback={feedback} />
    </form>
  );
}
