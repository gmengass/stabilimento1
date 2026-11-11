"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { roles } from "@/lib/auth/rules";
import type { StaffError, StaffResult, StaffRow } from "@/lib/auth/staff";
import { createStaffAction, resetPasswordAction, setDisabledAction } from "./actions";

type Done = "created" | "updated" | "passwordReset";
type Feedback = { kind: "done"; key: Done } | { kind: "error"; key: StaffError | "generic" } | null;

function useStaffAction() {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  function submit(call: () => Promise<StaffResult>, done: Done, onDone?: () => void) {
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
  const t = useTranslations("staff");
  if (!feedback) return null;
  if (feedback.kind === "done") {
    return (
      <p role="status" className="text-sm text-green-700">
        {t(`done.${feedback.key}`)}
      </p>
    );
  }
  return (
    <p role="alert" className="text-sm text-red-700">
      {t(`errors.${feedback.key}`)}
    </p>
  );
}

const field = "rounded border px-2 py-1";

export function CreateStaffForm() {
  const t = useTranslations("staff");
  const { pending, feedback, submit } = useStaffAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    submit(
      () => createStaffAction(input),
      "created",
      () => form.reset(),
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("create.title")}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t("create.username")}
        <input name="username" autoCapitalize="none" required className={field} />
        <span className="text-xs text-gray-600">{t("hints.username")}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("create.name")}
        <input name="name" required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("create.password")}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
        <span className="text-xs text-gray-600">{t("hints.password")}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("create.role")}
        <select name="role" defaultValue="staff" className={field}>
          {roles.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
      </label>
      <FeedbackLine feedback={feedback} />
      <button type="submit" disabled={pending} className="rounded bg-black px-3 py-2 text-white">
        {t("create.submit")}
      </button>
    </form>
  );
}

export function StaffRowActions({ user, isSelf }: { user: StaffRow; isSelf: boolean }) {
  const t = useTranslations("staff");
  const { pending, feedback, submit } = useStaffAction();

  function onToggle() {
    submit(() => setDisabledAction({ userId: user.id, disabled: !user.banned }), "updated");
  }

  function onReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = new FormData(form).get("password");
    submit(
      () => resetPasswordAction({ userId: user.id, password }),
      "passwordReset",
      () => form.reset(),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!isSelf && (
        <button type="button" onClick={onToggle} disabled={pending} className={field}>
          {user.banned ? t("enable") : t("disable")}
        </button>
      )}
      <form onSubmit={onReset} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          {t("reset.label", { username: user.username })}
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className={field}
          />
        </label>
        <button type="submit" disabled={pending} className={field}>
          {t("reset.submit")}
        </button>
      </form>
      <FeedbackLine feedback={feedback} />
    </div>
  );
}
