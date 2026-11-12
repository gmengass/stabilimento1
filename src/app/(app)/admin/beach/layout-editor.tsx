"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { BeachMap } from "@/components/beach-map";
import type { EditError, EditResult } from "@/lib/beach/edit";
import type { BeachLayout, MapSpot } from "@/lib/beach/layout";
import { MAX_SUNBEDS, MAX_UMBRELLAS_PER_LINE } from "@/lib/beach/limits";
import {
  addLineAction,
  addUmbrellasAction,
  removeLastLineAction,
  removeSpotAction,
  renameVenueAction,
  updateSpotAction,
} from "./actions";

type Outcome = EditResult | { ok: false; error: "forbidden" };
type Feedback = { ok: true } | { ok: false; error: EditError | "forbidden" | "generic" } | null;

const field = "rounded border px-2 py-2";
const button = "rounded border px-3 py-2 disabled:opacity-60";

function useEdit() {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  function run(call: () => Promise<Outcome>, onOk?: () => void) {
    startTransition(async () => {
      try {
        const result = await call();
        setFeedback(result);
        if (result.ok) onOk?.();
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

function formInput(event: FormEvent<HTMLFormElement>): Record<string, FormDataEntryValue> {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget));
}

interface SpotEditorProps {
  areaId: number;
  spot: MapSpot;
  onClose: () => void;
}

function SpotEditor({ areaId, spot, onClose }: SpotEditorProps) {
  const t = useTranslations("beachSetup");
  const { pending, feedback, run } = useEdit();
  const [confirming, setConfirming] = useState(false);
  const sunbedOptions = Array.from({ length: MAX_SUNBEDS + 1 }, (_, n) => n);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start">
        <h2 className="text-lg font-semibold">{t("spotTitle", { number: spot.number })}</h2>
        <button type="button" onClick={onClose} className="ml-auto rounded border px-2 py-1">
          {t("close")}
        </button>
      </div>
      <form
        onSubmit={(e) => run(() => updateSpotAction({ ...formInput(e), areaId, spotId: spot.id }))}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("spotNumber")}
          <input
            name="number"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={spot.number}
            required
            className={field}
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t("includedSunbeds")}
            <select name="includedSunbeds" defaultValue={spot.includedSunbeds} className={field}>
              {sunbedOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t("maxSunbeds")}
            <select name="maxSunbeds" defaultValue={spot.maxSunbeds} className={field}>
              {sunbedOptions.slice(1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={pending} className={button}>
          {t("save")}
        </button>
      </form>
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => removeSpotAction({ areaId, spotId: spot.id }), onClose)}
            className="flex-1 rounded bg-red-700 px-3 py-2 text-white disabled:opacity-60"
          >
            {t("removeSpotYes")}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={`flex-1 ${button}`}>
            {t("no")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded border border-red-700 px-3 py-2 text-red-700"
        >
          {t("removeSpot")}
        </button>
      )}
      <FeedbackLine feedback={feedback} />
    </div>
  );
}

function CountForm({
  label,
  submit,
  onSubmit,
  pending,
}: {
  label: string;
  submit: string;
  onSubmit: (umbrellas: FormDataEntryValue | undefined) => void;
  pending: boolean;
}) {
  return (
    <form onSubmit={(e) => onSubmit(formInput(e).umbrellas)} className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        {label}
        <input
          name="umbrellas"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_UMBRELLAS_PER_LINE}
          defaultValue={1}
          required
          className={`${field} w-20`}
        />
      </label>
      <button type="submit" disabled={pending} className={button}>
        {submit}
      </button>
    </form>
  );
}

function LinesEditor({ beach }: { beach: BeachLayout }) {
  const t = useTranslations("beachSetup");
  const { pending, feedback, run } = useEdit();
  const [confirmLine, setConfirmLine] = useState<number | null>(null);
  const lastLine = beach.lines.at(-1)?.number;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("linesTitle")}</h2>
      <ul className="flex flex-col gap-3">
        {beach.lines.map((line) => (
          <li key={line.number} className="flex flex-wrap items-end gap-3 border-b pb-3">
            <span className="min-w-40 font-medium">
              {t("lineSummary", { number: line.number, umbrellas: line.spots.length })}
            </span>
            <CountForm
              label={t("umbrellasToAdd")}
              submit={t("addUmbrellas")}
              pending={pending}
              onSubmit={(umbrellas) =>
                run(() =>
                  addUmbrellasAction({ areaId: beach.areaId, lineNumber: line.number, umbrellas }),
                )
              }
            />
            {line.number === lastLine &&
              (confirmLine === line.number ? (
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          removeLastLineAction({ areaId: beach.areaId, lineNumber: line.number }),
                        () => setConfirmLine(null),
                      )
                    }
                    className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-60"
                  >
                    {t("removeLineYes", { number: line.number })}
                  </button>
                  <button type="button" onClick={() => setConfirmLine(null)} className={button}>
                    {t("no")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmLine(line.number)}
                  className="rounded border border-red-700 px-3 py-2 text-red-700"
                >
                  {t("removeLine")}
                </button>
              ))}
          </li>
        ))}
      </ul>
      <CountForm
        label={t("newLineUmbrellas")}
        submit={t("addLine")}
        pending={pending}
        onSubmit={(umbrellas) => run(() => addLineAction({ areaId: beach.areaId, umbrellas }))}
      />
      <p className="text-sm text-gray-600">{t("linesHint")}</p>
      <FeedbackLine feedback={feedback} />
    </section>
  );
}

export function VenueNameForm({ name }: { name: string }) {
  const t = useTranslations("beachSetup");
  const { pending, feedback, run } = useEdit();
  return (
    <form
      onSubmit={(e) => run(() => renameVenueAction(formInput(e)))}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col gap-1 text-sm">
        {t("venueName")}
        <input name="venueName" defaultValue={name} required maxLength={100} className={field} />
      </label>
      <button type="submit" disabled={pending} className={button}>
        {t("save")}
      </button>
      <FeedbackLine feedback={feedback} />
    </form>
  );
}

/** Edit one beach space at any time: its lines, and each umbrella's number and sunbeds. */
export function LayoutEditor({ beach }: { beach: BeachLayout }) {
  const t = useTranslations("beachSetup");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = beach.lines.flatMap((l) => l.spots).find((s) => s.id === selectedId);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("mapTitle")}</h2>
        <p className="text-sm text-gray-600">{t("mapHint")}</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="min-w-0">
            <BeachMap
              areaName={beach.areaName}
              lines={beach.lines}
              viewOf={(spot) => (spot.id === selectedId ? "selected" : "free")}
              captionOf={(spot) => t("sunbedsCaption", { count: spot.includedSunbeds })}
              onSpotClick={(spot) => setSelectedId(spot.id === selectedId ? null : spot.id)}
            />
          </div>
          {selected && (
            <aside className="rounded border p-4 lg:sticky lg:top-4">
              <SpotEditor
                key={selected.id}
                areaId={beach.areaId}
                spot={selected}
                onClose={() => setSelectedId(null)}
              />
            </aside>
          )}
        </div>
      </section>
      <LinesEditor beach={beach} />
    </div>
  );
}
